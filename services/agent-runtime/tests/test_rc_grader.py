import copy
import unittest

from pydantic import ValidationError
from evals.rc_grader import grade


class IndependentRCGraderTests(unittest.TestCase):
    def setUp(self):
        self.labels = {'case_id':'negative-probe','tool_calls':[{'name':'get_account','arguments':{'account_id':'a'}}],
                       'bank_facts':{'balance':{'amount':'10.00','currency':'CNY'}}}
        self.outcome = {**copy.deepcopy(self.labels), 'execution_level':'OFFLINE','provider_http_successes':0,
                        'bank_db_verified':False,'model_key_configured':False,'test_was_executed':True}
        del self.outcome['case_id']

    def test_wrong_tool_arguments_do_not_get_credit_from_correct_facts(self):
        self.outcome['tool_calls'][0]['arguments']['account_id']='foreign'
        result=grade(self.labels,self.outcome)
        self.assertFalse(result['tool_argument_correct']);self.assertTrue(result['bank_fact_correct'])
        self.assertEqual(result['status'],'FAIL')

    def test_wrong_facts_do_not_get_credit_from_correct_tool(self):
        self.outcome['bank_facts']['balance']['amount']='100.00'
        result=grade(self.labels,self.outcome)
        self.assertTrue(result['tool_argument_correct']);self.assertFalse(result['bank_fact_correct'])

    def test_empty_or_missing_labels_are_invalid_not_pass(self):
        for labels in [{}, {**self.labels,'tool_calls':[]}, {**self.labels,'bank_facts':{}}, {**self.labels,'case_id':''}]:
            with self.assertRaises(ValidationError):grade(labels,self.outcome)

    def test_missing_arguments_and_extra_response_text_cannot_fake_execution(self):
        self.outcome['tool_calls']=[{'name':'get_account'}]
        with self.assertRaises(ValidationError):grade(self.labels,self.outcome)
        self.outcome['answer']='Looks correct'
        with self.assertRaises(ValidationError):grade(self.labels,self.outcome)

    def test_offline_missing_key_and_unexecuted_never_pass_live_gate(self):
        self.assertEqual(grade(self.labels,self.outcome,require_live=True)['status'],'BLOCKED')
        for field,value in [('provider_http_successes',0),('bank_db_verified',False),('model_key_configured',False),('test_was_executed',False)]:
            attempt={**self.outcome,'execution_level':'REAL_MODEL_BANK_DB','provider_http_successes':1,
                     'bank_db_verified':True,'model_key_configured':True,'test_was_executed':True,field:value}
            self.assertEqual(grade(self.labels,attempt,require_live=True)['status'],'BLOCKED')

    def test_decimal_currency_and_missing_fact_checks_are_independent(self):
        self.outcome['bank_facts']['balance']['amount']='10.0'
        self.assertTrue(grade(self.labels,self.outcome)['bank_fact_correct'])
        self.outcome['bank_facts']['balance']['currency']='USD'
        self.assertFalse(grade(self.labels,self.outcome)['bank_fact_correct'])
        self.outcome['bank_facts']={}
        self.assertFalse(grade(self.labels,self.outcome)['bank_fact_correct'])
