import unittest

from app.agent_v2.models import PlannerDecision, Task, Observation
from app.agent_v2.runtime import AgentRuntimeV2
from test_agent_v2 import CancellableBank


class DisputedPlanner:
    def __init__(self): self.calls=0; self.audits=0
    async def plan_subgoals(self, *_):
        return [{'step_id':'g1','goal':'查看余额','kind':'READ','evidence_tools':['list_accounts'],
                 'dependencies':[], 'status':'PENDING'}]
    async def decide(self, context):
        self.calls+=1
        if not context['observations']:
            return PlannerDecision(type='TOOL_CALL',tool_call={'tool_name':'list_accounts','arguments':{}})
        return PlannerDecision(type='COMPLETE',final_message=f'余额已查询，第{self.calls}次措辞。')
    async def audit_completion(self, *_):
        self.audits+=1
        return ['g1']


class CompletionRecoveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_same_dispute_has_bounded_replanning_without_downgrading_bank_evidence(self):
        planner=DisputedPlanner(); runtime=AgentRuntimeV2(CancellableBank(),planner)
        result=await runtime.chat('查看余额','SESSION=alice')
        task=runtime.tasks[result.task_id]
        self.assertEqual(result.status.value,'PARTIAL')
        self.assertLessEqual(planner.calls,4)
        self.assertEqual(task.ledger[0]['status'],'SUCCEEDED')
        self.assertTrue(any(t.get('repeated') for t in task.trace))
        saved=Task.model_validate_json(task.model_dump_json())
        runtime.tasks[task.task_id]=saved
        before=saved.model_dump_json(); count=planner.calls
        refreshed=await runtime.get(task.task_id,'SESSION=alice')
        self.assertEqual(refreshed.message,result.message)
        self.assertEqual(planner.calls,count)
        self.assertEqual(saved.model_dump_json(),before)  # GET never writes.

    async def test_last_answer_and_clarification_survive_checkpoint_roundtrip(self):
        class Planner:
            async def decide(self,_):
                return PlannerDecision(type='ASK_USER',question={'text':'请明确收款人和金额。'})
        runtime=AgentRuntimeV2(CancellableBank(),Planner())
        result=await runtime.chat('帮我转账','SESSION=alice')
        runtime.tasks[result.task_id]=Task.model_validate_json(runtime.tasks[result.task_id].model_dump_json())
        restored=await runtime.get(result.task_id,'SESSION=alice')
        self.assertEqual(restored.message,result.message)
        self.assertEqual(restored.status,result.status)
        self.assertIsNone(restored.confirmation)
