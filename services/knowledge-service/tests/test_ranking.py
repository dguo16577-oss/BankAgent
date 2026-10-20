import unittest
from app.search import _rank, _with_body


class RankingTests(unittest.TestCase):
    def test_graph_does_not_override_exact_and_semantic_top_hit(self):
        rows = [('exact', 'doc1')] + [(str(i), 'other'+str(i)) for i in range(30)]
        ranking = [(i, 1/(i+1)) for i in range(31)]
        self.assertEqual(_rank(ranking, ranking, rows, {'29'}, 5)[0][0], 0)

    def test_document_diversity_avoids_single_source_crowding(self):
        rows = [(str(i), 'same' if i<6 else 'other') for i in range(8)]
        ranking = [(i, 1/(i+1)) for i in range(8)]
        indices = [i for i, _ in _rank(ranking, ranking, rows, set(), 5)]
        self.assertIn(6, indices)
        self.assertIn(7, indices)

    def test_single_product_query_can_expand_existing_document(self):
        rows = [(str(i), 'same') for i in range(6)]
        ranking = [(i, 1) for i in range(6)]
        self.assertEqual(len(_rank(ranking, ranking, rows, set(), 5)), 5)

    def test_tiny_trigram_overlap_does_not_double_vote_headers(self):
        rows = [('header', 'a'), ('policy', 'b')]
        result = _rank([(0, .01), (1, 0)], [(1, .9), (0, .8)], rows, set(), 2)
        self.assertEqual(result[0][0], 1)

    def test_title_hit_expands_to_own_version_body_and_deduplicates(self):
        def item(doc, version, chunk, text):
            r = [None]*18
            r[1], r[6], r[17], r[12] = doc, version, chunk, text
            return r
        rows = [item('d','v1',0,'# title'), item('d','v1',1,'Actual policy'),
                item('other','v1',1,'Private other chunk'), item('d','v2',1,'Other version')]
        result = _with_body(rows, [(0,1), (1,.9)], 5)
        self.assertEqual(result, [(1,1)])
