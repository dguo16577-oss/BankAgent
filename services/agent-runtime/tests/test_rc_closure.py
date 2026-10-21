import json
import unittest

import httpx

from app.agent_v2.models import PlannerDecision
from app.agent_v2.multi_agent import SpecialistPlanner, SupervisorRegistry
from app.agent_v2.planner import DeepSeekPlanner
from test_agent_v2 import CancellableBank
from test_multi_agent import parent


class ClosureSpecialistTests(unittest.IsolatedAsyncioTestCase):
    async def test_delegate_step_id_uses_parent_goal_without_model_rewriting_it(self):
        seen=[]
        class Child:
            async def decide(self,context):
                seen.append(context['goal']['text'])
                return PlannerDecision(type='ASK_USER',question={'text':'需要补充资料'})
        registry=SupervisorRegistry(CancellableBank(),save_task=lambda _:None,specialist_factory=lambda _:Child())
        result=await registry.call('delegate_financial_analysis',{'step_id':'g1'},parent(),'SESSION=alice')
        self.assertEqual(seen,['查询余额'])
        self.assertFalse(result.success)
        schema=next(t for t in registry.visible() if t['name']=='delegate_financial_analysis')['input_schema']
        self.assertNotIn('delegated_goal',schema['properties'])

    async def test_invalid_child_json_has_one_bounded_repair_inside_original_budget(self):
        class Child:
            calls=0
            async def decide(self,context):
                self.calls+=1
                if self.calls==1:raise json.JSONDecodeError('invalid JSON','',0)
                if not context['observations']:
                    return PlannerDecision(type='TOOL_CALL',tool_call={'tool_name':'list_accounts','arguments':{}})
                return PlannerDecision(type='COMPLETE',final_message='已查询账户。')
        child=Child();task=parent();registry=SupervisorRegistry(CancellableBank(),save_task=lambda _:None,specialist_factory=lambda _:child)
        result=await registry.call('delegate_financial_analysis',{'step_id':'g1','delegated_goal':'查询余额'},task,'SESSION=alice')
        self.assertTrue(result.success);self.assertEqual(child.calls,3);self.assertEqual(task.delegation_model_calls,3)
        self.assertEqual(task.delegations[0]['decision_repairs'],1)

    async def test_repeated_invalid_child_json_stops_without_tool_or_mutation(self):
        class Child:
            calls=0
            async def decide(self,context):
                self.calls+=1;raise json.JSONDecodeError('invalid JSON','',0)
        child=Child();bank=CancellableBank();task=parent();registry=SupervisorRegistry(bank,save_task=lambda _:None,specialist_factory=lambda _:child)
        result=await registry.call('delegate_financial_analysis',{'step_id':'g1','delegated_goal':'查询余额'},task,'SESSION=alice')
        self.assertFalse(result.success);self.assertEqual(child.calls,2)
        self.assertEqual(bank.debits,0);self.assertEqual(bank.intents,{})

    async def test_financial_ledger_schema_uses_receipts_not_prepare_tools(self):
        captured={}
        class Model:
            async def _json_completion(self,system,user,limit):
                captured.update(json.loads(user))
                return {'steps':[{'step_id':'g1','goal':'给张三转10元','kind':'FINANCIAL_ACTION',
                    'source_quote':'给张三转10元','evidence_tools':['confirmed_transfer'],'dependencies':[]}]}
        result=await DeepSeekPlanner(Model()).plan_subgoals('给张三转10元，只准备复核单',
            [{'name':'prepare_transfer','category':'PREPARE'},{'name':'list_accounts','category':'READ'}])
        variants=captured['ledger_schema']['properties']['steps']['items']['oneOf']
        financial=next(v for v in variants if v['properties']['kind']['const']=='FINANCIAL_ACTION')
        allowed=financial['properties']['evidence_tools']['items']['enum']
        self.assertIn('confirmed_transfer',allowed)
        self.assertNotIn('prepare_transfer',allowed)
        self.assertEqual(result[0]['status'],'PENDING')

    async def test_invalid_prepare_completion_evidence_is_still_hard_rejected(self):
        class Model:
            async def _json_completion(self,*args):
                return {'steps':[{'goal':'给张三转10元','kind':'FINANCIAL_ACTION',
                    'source_quote':'给张三转10元','evidence_tools':['prepare_transfer'],'dependencies':[]}]}
        with self.assertRaisesRegex(ValueError,'INVALID_TASK_LEDGER'):
            await DeepSeekPlanner(Model()).plan_subgoals('给张三转10元',
                [{'name':'prepare_transfer','category':'PREPARE'}])

    async def test_knowledge_schema_excludes_parent_control_and_other_tools(self):
        captured = {}
        class Model:
            async def _json_completion(self, system, user, limit):
                captured.update(json.loads(user))
                return {'type':'ASK_USER','question':{'text':'没有适用政策证据。'}}
        planner = SpecialistPlanner('bank_knowledge'); planner.classifier = Model()
        await planner.decide({'goal':{'text':'查询储蓄政策'},'state':{'analytical_scope':{'account_id':'a'},
            'selected_recipient_id':'recipient-secret','has_prepared_intent':True},'observations':[],
            'available_tools':[{'name':'search_bank_knowledge'}]})
        schema = captured['decision_schema']['$defs']['ToolCall']['properties']
        self.assertEqual(schema['tool_name']['enum'], ['search_bank_knowledge'])
        self.assertEqual(schema['scope_clear']['maxItems'], 0)
        self.assertNotIn('selected_recipient_id', captured['state'])
        self.assertEqual(captured['state']['analytical_scope'], {})

    async def test_specialist_decoder_rejects_scope_clear_even_when_model_returns_it(self):
        class Model:
            async def _json_completion(self, *args):
                return {'type':'TOOL_CALL','tool_call':{'tool_name':'search_bank_knowledge',
                    'arguments':{'query':'policy'},'scope_clear':['category']}}
        planner=SpecialistPlanner('bank_knowledge'); planner.classifier=Model()
        with self.assertRaisesRegex(ValueError, 'SPECIALIST_TOOL_NOT_PERMITTED'):
            await planner.decide({'available_tools':[{'name':'search_bank_knowledge'}]})

    async def test_terminal_failure_replay_does_not_repeat_child_model(self):
        class Child:
            calls=0
            async def decide(self, context):
                self.calls+=1
                return PlannerDecision(type='TOOL_CALL',tool_call={'tool_name':'execute_transfer','arguments':{}})
        child=Child();current=parent();registry=SupervisorRegistry(CancellableBank(),save_task=lambda _:None,specialist_factory=lambda _:child)
        args={'step_id':'g1','delegated_goal':'查询余额'}
        first=await registry.call('delegate_financial_analysis',args,current,'SESSION=alice')
        second=await registry.call('delegate_financial_analysis',args,current,'SESSION=alice')
        self.assertFalse(first.success or second.success)
        self.assertEqual(child.calls,1)
        self.assertEqual(current.delegation_model_calls,1)
        self.assertEqual(second.error,'SPECIALIST_TOOL_NOT_PERMITTED')

    async def test_provider_failure_has_safe_persistent_error_type(self):
        class Child:
            async def decide(self, context):
                raise httpx.ConnectError('private URL and credential must not be logged')
        current=parent();registry=SupervisorRegistry(CancellableBank(),save_task=lambda _:None,specialist_factory=lambda _:Child())
        await registry.call('delegate_financial_analysis',{'step_id':'g1','delegated_goal':'查询余额'},current,'SESSION=alice')
        record=current.delegations[0]
        self.assertEqual(record['failure_reason'],'SPECIALIST_CONNECTION_ERROR')
        self.assertIn({'kind':'SPECIALIST_FAILED','exception_type':'ConnectError','code':'SPECIALIST_CONNECTION_ERROR'},record['trace'])
        self.assertNotIn('private URL',json.dumps(record))
