from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ingest import Source, chunks, ingest, normalize, parse_file, public_demo_sources
from app.search import search


class ParsingTests(unittest.TestCase):
    def test_markdown_html_txt_pdf_parsers_and_locations(self):
        from pypdf import PdfWriter
        from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "source.md").write_text("# Heading\nAn exact rule.\n", encoding="utf-8")
            (root / "source.txt").write_text("A text rule.\n", encoding="utf-8")
            (root / "source.html").write_text("<h1>Rule</h1><script>attack()</script><p>Actual policy</p>", encoding="utf-8")
            writer = PdfWriter()
            page = writer.add_blank_page(width=300, height=200)
            font = writer._add_object(DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")}))
            page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"):
                DictionaryObject({NameObject("/F1"): font})})
            stream = DecodedStreamObject()
            stream.set_data(b"BT /F1 12 Tf 20 100 Td (PDF policy text) Tj ET")
            page[NameObject("/Contents")] = writer._add_object(stream)
            with (root / "source.pdf").open("wb") as pdf:
                writer.write(pdf)
            self.assertIn("An exact rule", parse_file(root / "source.md"))
            self.assertIn("A text rule", parse_file(root / "source.txt"))
            self.assertIn("PDF policy text", parse_file(root / "source.pdf"))
            self.assertNotIn("attack()", parse_file(root / "source.html"))
            self.assertEqual(chunks("# Heading\nAn exact rule.")[0][2], "L1-L2")
            self.assertEqual(normalize("a   b\r\n c"), "a b\nc")


@unittest.skipUnless(os.getenv("KNOWLEDGE_DATABASE_URL"), "isolated PostgreSQL DSN required")
class PostgreSQLTests(unittest.TestCase):
    def setUp(self):
        import psycopg

        self.conn = psycopg.connect(os.environ["KNOWLEDGE_DATABASE_URL"], autocommit=True)

    def tearDown(self):
        self.conn.close()

    def test_demo_import_idempotency_and_real_search(self):
        sources = public_demo_sources(self.conn)
        self.assertEqual(len(sources), 36)
        self.assertEqual({source.category for source in sources}, {
            "BANK_ACCOUNT", "TRANSFER", "CARD", "WEALTH", "SPENDING",
            "SUBSCRIPTION", "SECURITY", "GENERAL_FAQ"})
        source = next(source for source in sources if source.uri.endswith("/lost-card"))
        first = ingest(self.conn, source)
        second = ingest(self.conn, source)
        self.assertIn(first, {"SUCCEEDED", "SKIPPED"})
        self.assertEqual(second, "SKIPPED")
        result = search(self.conn, "What to do if your card is lost?", category="CARD")
        self.assertEqual(result["status"], "OK")
        self.assertEqual(result["evidence"][0]["source_uri"], source.uri)
        self.assertEqual(result["evidence"][0]["source_label"], "Aster Demo Policy")

    def test_access_control_is_in_sql_and_private_ingest_is_denied(self):
        with self.assertRaisesRegex(ValueError, "identity flow"):
            ingest(self.conn, Source("repo://private.md", "Private", "SECURITY", "MARKDOWN", "en", None,
                                     datetime.now(timezone.utc), "private text", "1", "CUSTOMER", "cust-a"))
        with self.assertRaisesRegex(ValueError, "allowlisted"):
            ingest(self.conn, Source("https://attacker.invalid/policy", "Fake", "SECURITY", "HTML", "en", None,
                                     datetime.now(timezone.utc), "malicious text", "1"))

    def test_private_row_cannot_escape_server_filter(self):
        import psycopg

        private_uri = "repo://private-" + uuid4().hex
        with psycopg.connect(os.environ["KNOWLEDGE_DATABASE_URL"]) as conn:
            customer = "knowledge-test-" + uuid4().hex
            document_id, version_id = uuid4(), uuid4()
            conn.execute("INSERT INTO customers(customer_id,display_name,created_at,account_as_of) VALUES (%s,'Test',now(),now())", (customer,))
            conn.execute("""INSERT INTO knowledge.documents(document_id,title,category,source_uri,source_type,language,access_scope,owner_customer_id)
                VALUES (%s,'Private policy','SECURITY',%s,'TXT','en','CUSTOMER',%s)""", (document_id, private_uri, customer))
            conn.execute("""INSERT INTO knowledge.document_versions(document_version_id,document_id,version,effective_from,status,content_hash,original_content,last_verified_at)
                VALUES (%s,%s,'1','2026-01-01T00:00:00Z','PUBLISHED',repeat('a',64),'secret rule',now())""", (version_id, document_id))
            conn.execute("""INSERT INTO knowledge.document_chunks(chunk_id,document_version_id,chunk_index,heading_path,content,source_location)
                VALUES (%s,%s,0,'Secret','secret rule only for another customer','L1')""", (uuid4(), version_id))
            results = search(conn, "secret rule only for another customer", category="SECURITY")
            self.assertNotIn(private_uri, [item["source_uri"] for item in results["evidence"]])
            conn.rollback()


    def test_effective_date_selects_version_without_replacing_history(self):
        uri = "repo://version-test-" + uuid4().hex
        try:
            first = Source(uri, "Transfer policy version test", "TRANSFER", "TXT", "en", None,
                           datetime(2026, 1, 1, tzinfo=timezone.utc),
                           "Legacy transfer policy permits an illustrative Alpha route.", "v1")
            second = Source(uri, "Transfer policy version test", "TRANSFER", "TXT", "en", None,
                            datetime(2026, 8, 1, tzinfo=timezone.utc),
                            "Current transfer policy permits an illustrative Beta route.", "v2")
            self.assertEqual(ingest(self.conn, first), "SUCCEEDED")
            self.assertEqual(ingest(self.conn, second), "SUCCEEDED")
            old = search(self.conn, "Legacy transfer policy Alpha", category="TRANSFER",
                         effective_at=datetime(2026, 3, 1, tzinfo=timezone.utc))
            current = search(self.conn, "Current transfer policy Beta", category="TRANSFER",
                             effective_at=datetime(2026, 10, 1, tzinfo=timezone.utc))
            self.assertEqual(old["evidence"][0]["version"], "v1")
            self.assertEqual(old["evidence"][0]["effective_status"], "HISTORICAL")
            self.assertEqual(current["evidence"][0]["version"], "v2")
            self.assertEqual(current["evidence"][0]["effective_status"], "CURRENT")
        finally:
            self.conn.execute("""DELETE FROM knowledge.document_versions WHERE document_id IN
                (SELECT document_id FROM knowledge.documents WHERE source_uri=%s)""", (uri,))
            self.conn.execute("DELETE FROM knowledge.documents WHERE source_uri=%s", (uri,))
            self.conn.execute("DELETE FROM knowledge.ingestion_jobs WHERE source_uri=%s", (uri,))


if __name__ == "__main__":
    unittest.main()
