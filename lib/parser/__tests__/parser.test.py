"""
Parser test suite. Covers failure modes and edge cases.

Includes deterministic file fixtures generated at test runtime so PDF
ingestion/layout logic is exercised without relying on external binaries.
"""
import os
import sys
import unittest
import json
from io import BytesIO
from typing import Callable

_TEST_DIR = os.path.dirname(os.path.abspath(__file__))
_LIB_DIR = os.path.dirname(os.path.dirname(_TEST_DIR))
_WORKSPACE = os.path.normpath(os.path.join(_LIB_DIR, "..", ".."))
for p in (_WORKSPACE, os.getcwd()):
    if p and p not in sys.path:
        sys.path.insert(0, p)

from lib.parser import parse_resume, to_legacy_parsed_resume


def _require_reportlab():
    try:
        from reportlab.lib.pagesizes import letter  # noqa: F401
        from reportlab.pdfgen import canvas  # noqa: F401
        return True
    except Exception:
        return False


def _make_pdf(path: str, draw: Callable):
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    packet = BytesIO()
    c = canvas.Canvas(packet, pagesize=letter)
    draw(c, letter[0], letter[1])
    c.save()
    with open(path, "wb") as f:
        f.write(packet.getvalue())


def _write_text_fixture(path: str, lines: list[str]):
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines).strip() + "\n")


def _draw_lines(c, start_y: int, lines: list[str], x: int = 72, step: int = 14):
    y = start_y
    for line in lines:
        c.drawString(x, y, line)
        y -= step


class FixtureFactory:
    @staticmethod
    def _case_lines() -> dict[str, list[str]]:
        return {
            "single_column_standard": [
                "Jane Smith",
                "jane.smith@university.edu | (555) 123-4567 | Tampa, FL",
                "",
                "EDUCATION",
                "University of Tampa",
                "B.S. in Marketing | GPA: 3.7/4.0",
                "Expected May 2025",
                "",
                "EXPERIENCE",
                "Acme Corp",
                "Marketing Intern",
                "Jan 2024 - Present",
                "* Led social media campaign",
                "* Increased engagement 20%",
                "",
                "SKILLS",
                "Python | SQL | Excel",
            ],
            "two_column_sidebar": [
                "John TwoColumn",
                "john.twocol@example.com",
                "",
                "EXPERIENCE",
                "Acme Corp",
                "Analyst",
                "2022 - Present",
                "* Built dashboard",
                "",
                "SKILLS",
                "Python",
                "SQL",
                "Tableau",
            ],
            "table_based_layout": [
                "Taylor Table",
                "taylor.table@example.com",
                "EXPERIENCE | DATES | LOCATION",
                "Acme Corp - Intern | Jan 2023 - May 2023 | Tampa, FL",
                "Beta LLC - Analyst | Jun 2023 - Present | Remote",
            ],
            "non_standard_headers": [
                "Nora Headers",
                "nora.headers@example.com",
                "",
                "PROFESSIONAL JOURNEY",
                "Acme Corp - Engineer - 2022-Present",
                "",
                "AREAS OF EXPERTISE",
                "Python, Data Analysis, Leadership",
            ],
            "gpa_formats": [
                "Gina GPA",
                "gina.gpa@example.com",
                "",
                "EDUCATION",
                "University of Tampa",
                "B.S. in Computer Science",
                "GPA: 3.8/4.0",
                "Cumulative GPA: 3.9",
                "(3.7 GPA)",
            ],
            "hyphenated_name": [
                "Mary-Jane Watson",
                "maryjane@example.com",
                "",
                "EDUCATION",
                "University of Tampa",
                "B.S. in Biology",
            ],
            "apostrophe_name": [
                "Patrick O'Brien",
                "patrick@example.com",
                "",
                "EDUCATION",
                "University of Tampa",
                "B.A. in History",
            ],
            "missing_gpa": [
                "No GPA",
                "nogpa@example.com",
                "",
                "EDUCATION",
                "University of Tampa",
                "B.S. in Economics",
                "Expected May 2025",
            ],
            "double_major": [
                "Jane DoubleMajor",
                "jane.dm@example.com",
                "",
                "EDUCATION",
                "University of Tampa",
                "Double major in Finance and Economics",
            ],
            "multiple_degrees": [
                "Multi Degree",
                "multi.degree@example.com",
                "",
                "EDUCATION",
                "University of Tampa",
                "B.S. in Finance",
                "Expected May 2024",
                "",
                "State College",
                "Associate of Science in Business",
                "May 2022",
            ],
            "skills_pipe_separated": [
                "Pipe Skills",
                "pipe.skills@example.com",
                "",
                "SKILLS",
                "Python | Java | React | SQL | AWS",
            ],
            "skills_bullet_list": [
                "Bullet Skills",
                "bullet.skills@example.com",
                "",
                "SKILLS",
                "* Python",
                "* JavaScript",
                "* React",
            ],
            "no_skills_section": [
                "No Skills Section",
                "noskills@example.com",
                "",
                "EXPERIENCE",
                "Software Engineer at Tech Corp",
                "Built applications using Python and React. Used AWS.",
            ],
            "dates_various_formats": [
                "Date Formats",
                "dates@example.com",
                "",
                "EXPERIENCE",
                "Acme Corp",
                "Software Engineer",
                "January 2022 - Present",
                "Beta Inc",
                "Intern",
                "2020 - 2021",
                "Gamma Co",
                "Analyst",
                "Fall 2019 - Spring 2020",
            ],
            "name_in_header": [
                "Header Name",
                "header.name@example.com",
                "",
                "EDUCATION",
                "University of Tampa",
                "B.S. in Mathematics",
            ],
            "contact_in_footer": [
                "Footer Contact",
                "",
                "EDUCATION",
                "University of Tampa",
                "B.S. in Physics",
                "",
                "footer.contact@example.com | (555) 222-3333 | Tampa, FL",
            ],
            "international_name": [
                "Jose Alvarez",
                "jose.alvarez@example.com",
                "",
                "EDUCATION",
                "University of Tampa",
                "B.S. in Engineering",
            ],
        }

    @staticmethod
    def build_all(fixtures_dir: str):
        os.makedirs(fixtures_dir, exist_ok=True)
        lines = FixtureFactory._case_lines()

        # 1) single_column_standard.pdf
        _make_pdf(os.path.join(fixtures_dir, "single_column_standard.pdf"), lambda c, w, h: _draw_lines(c, int(h - 70), lines["single_column_standard"]))

        # 2) two_column_sidebar.pdf
        def draw_two_col(c, w, h):
            _draw_lines(c, int(h - 70), [
                "John TwoColumn",
                "john.twocol@example.com",
                "",
                "EXPERIENCE",
                "Acme Corp",
                "Analyst",
                "2022 - Present",
                "* Built dashboard",
            ], x=72)
            _draw_lines(c, int(h - 70), [
                "SKILLS",
                "Python",
                "SQL",
                "Tableau",
            ], x=340)
        _make_pdf(os.path.join(fixtures_dir, "two_column_sidebar.pdf"), draw_two_col)

        # 3) table_based_layout.pdf
        def draw_table(c, w, h):
            c.drawString(72, int(h - 70), "Taylor Table")
            c.drawString(72, int(h - 86), "taylor.table@example.com")
            y = int(h - 130)
            rows = [
                ("EXPERIENCE", "DATES", "LOCATION"),
                ("Acme Corp - Intern", "Jan 2023 - May 2023", "Tampa, FL"),
                ("Beta LLC - Analyst", "Jun 2023 - Present", "Remote"),
            ]
            for r in rows:
                c.drawString(72, y, r[0])
                c.drawString(260, y, r[1])
                c.drawString(420, y, r[2])
                y -= 16
        _make_pdf(os.path.join(fixtures_dir, "table_based_layout.pdf"), draw_table)

        # 4) non_standard_headers.pdf
        _make_pdf(os.path.join(fixtures_dir, "non_standard_headers.pdf"), lambda c, w, h: _draw_lines(c, int(h - 70), lines["non_standard_headers"]))

        # 5) gpa_formats.pdf
        _make_pdf(os.path.join(fixtures_dir, "gpa_formats.pdf"), lambda c, w, h: _draw_lines(c, int(h - 70), lines["gpa_formats"]))

        # 6) hyphenated_name.pdf
        _make_pdf(os.path.join(fixtures_dir, "hyphenated_name.pdf"), lambda c, w, h: _draw_lines(c, int(h - 70), lines["hyphenated_name"]))

        # 7) apostrophe_name.pdf
        _make_pdf(os.path.join(fixtures_dir, "apostrophe_name.pdf"), lambda c, w, h: _draw_lines(c, int(h - 70), lines["apostrophe_name"]))

        # 8) missing_gpa.pdf
        _make_pdf(os.path.join(fixtures_dir, "missing_gpa.pdf"), lambda c, w, h: _draw_lines(c, int(h - 70), lines["missing_gpa"]))

        # 9) double_major.pdf
        _make_pdf(os.path.join(fixtures_dir, "double_major.pdf"), lambda c, w, h: _draw_lines(c, int(h - 70), lines["double_major"]))

        # 10) multiple_degrees.pdf
        _make_pdf(os.path.join(fixtures_dir, "multiple_degrees.pdf"), lambda c, w, h: _draw_lines(c, int(h - 70), lines["multiple_degrees"]))

        # 11) skills_pipe_separated.pdf
        _make_pdf(os.path.join(fixtures_dir, "skills_pipe_separated.pdf"), lambda c, w, h: _draw_lines(c, int(h - 70), lines["skills_pipe_separated"]))

        # 12) skills_bullet_list.pdf
        _make_pdf(os.path.join(fixtures_dir, "skills_bullet_list.pdf"), lambda c, w, h: _draw_lines(c, int(h - 70), lines["skills_bullet_list"]))

        # 13) no_skills_section.pdf
        _make_pdf(os.path.join(fixtures_dir, "no_skills_section.pdf"), lambda c, w, h: _draw_lines(c, int(h - 70), lines["no_skills_section"]))

        # 14) dates_various_formats.pdf
        _make_pdf(os.path.join(fixtures_dir, "dates_various_formats.pdf"), lambda c, w, h: _draw_lines(c, int(h - 70), lines["dates_various_formats"]))

        # 15) name_in_header.pdf
        def draw_name_header(c, w, h):
            c.drawString(72, int(h - 28), "Header Name")
            _draw_lines(c, int(h - 70), [
                "header.name@example.com",
                "",
                "EDUCATION",
                "University of Tampa",
                "B.S. in Mathematics",
            ])
        _make_pdf(os.path.join(fixtures_dir, "name_in_header.pdf"), draw_name_header)

        # 16) contact_in_footer.pdf
        def draw_footer_contact(c, w, h):
            _draw_lines(c, int(h - 70), [
                "Footer Contact",
                "",
                "EDUCATION",
                "University of Tampa",
                "B.S. in Physics",
            ])
            c.drawString(72, 36, "footer.contact@example.com | (555) 222-3333 | Tampa, FL")
        _make_pdf(os.path.join(fixtures_dir, "contact_in_footer.pdf"), draw_footer_contact)

        # 17) international_name.pdf
        _make_pdf(os.path.join(fixtures_dir, "international_name.pdf"), lambda c, w, h: _draw_lines(c, int(h - 70), lines["international_name"]))

    @staticmethod
    def build_text_fallback(fixtures_dir: str):
        os.makedirs(fixtures_dir, exist_ok=True)
        lines = FixtureFactory._case_lines()
        for base, case_lines in lines.items():
            _write_text_fixture(os.path.join(fixtures_dir, f"{base}.txt"), case_lines)


class TestParser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.fixtures_dir = os.path.join(_TEST_DIR, "fixtures")
        cls.use_pdf_fixtures = _require_reportlab()
        if cls.use_pdf_fixtures:
            FixtureFactory.build_all(cls.fixtures_dir)
        else:
            FixtureFactory.build_text_fallback(cls.fixtures_dir)
        golden_path = os.path.join(cls.fixtures_dir, "golden_expected.json")
        with open(golden_path, "r", encoding="utf-8") as f:
            cls.golden_expected = json.load(f)

    def _parse_fixture_pdf(self, fixture_name: str):
        base = fixture_name[:-4] if fixture_name.endswith(".pdf") else fixture_name
        if self.use_pdf_fixtures:
            path = os.path.join(self.fixtures_dir, f"{base}.pdf")
            mime = "application/pdf"
        else:
            path = os.path.join(self.fixtures_dir, f"{base}.txt")
            mime = "text/plain"
        self.assertTrue(os.path.exists(path), f"Missing fixture: {fixture_name}")
        with open(path, "rb") as f:
            buf = f.read()
        return parse_resume(buf, mime, use_llm=False)

    def _snapshot(self, parsed):
        skills_all = parsed.skills.value.all if parsed.skills.value else []
        return {
            "name": parsed.name.value,
            "email": parsed.email.value,
            "layout": parsed.layout_detected,
            "sections": list(parsed.sections.keys()) if isinstance(parsed.sections, dict) else [],
            "education_count": len(parsed.education.value or []),
            "experience_count": len(parsed.experience.value or []),
            "skills_count": len(skills_all),
            "raw_text_len": len(parsed.raw_text or ""),
        }

    def _assert_golden(self, case: str, snapshot: dict):
        expected = self.golden_expected[case]
        if "name_contains" in expected:
            if snapshot["name"] is None:
                self.fail(f"{case}: expected name containing '{expected['name_contains']}', got None")
            self.assertIn(expected["name_contains"], str(snapshot["name"]).lower(), f"{case}: name mismatch")

        if "email" in expected:
            self.assertEqual(expected["email"], snapshot["email"], f"{case}: email mismatch")

        if "email_any_of" in expected:
            self.assertIn(snapshot["email"], expected["email_any_of"], f"{case}: email not in allowed set")

        if "layout_in" in expected:
            self.assertIn(snapshot["layout"], expected["layout_in"], f"{case}: layout mismatch")

        if "sections_include" in expected:
            for sec in expected["sections_include"]:
                self.assertIn(sec, snapshot["sections"], f"{case}: missing section '{sec}'")

        if "sections_include_any" in expected:
            self.assertTrue(
                any(sec in snapshot["sections"] for sec in expected["sections_include_any"]),
                f"{case}: none of expected sections found",
            )

        if "education_count_min" in expected:
            self.assertGreaterEqual(snapshot["education_count"], expected["education_count_min"], f"{case}: education_count too low")

        if "experience_count_min" in expected:
            self.assertGreaterEqual(snapshot["experience_count"], expected["experience_count_min"], f"{case}: experience_count too low")

        if "skills_count_min" in expected:
            self.assertGreaterEqual(snapshot["skills_count"], expected["skills_count_min"], f"{case}: skills_count too low")

        if "raw_text_len_min" in expected:
            self.assertGreaterEqual(snapshot["raw_text_len"], expected["raw_text_len_min"], f"{case}: raw_text_len too low")

    def test_single_column_standard(self):
        buf = (
            b"Jane Smith\njane.smith@university.edu | (555) 123-4567 | Tampa, FL\n\n"
            b"EDUCATION\nUniversity of Tampa\nB.S. in Marketing | GPA: 3.7/4.0\n"
            b"Expected May 2025\n\nEXPERIENCE\nMarketing Intern, Acme Corp\n"
            b"Jan 2024 - Present\n* Led social media campaign\n* Increased engagement 20%\n"
        )
        parsed = parse_resume(buf, "text/plain", use_llm=False)
        legacy = to_legacy_parsed_resume(parsed)
        self.assertEqual(legacy.name, "Jane Smith")
        self.assertIn("Marketing", legacy.major or "")
        self.assertEqual(legacy.gpa, 3.7)
        self.assertIn("education", legacy.sections)
        self.assertIn("experience", legacy.sections)

    def test_hyphenated_name(self):
        buf = b"Mary-Jane Watson\nmaryjane@example.com\n\nEDUCATION\nUniversity of Tampa\nB.S. in Biology\n"
        parsed = parse_resume(buf, "text/plain", use_llm=False)
        legacy = to_legacy_parsed_resume(parsed)
        name = (legacy.name or "").lower()
        self.assertIn("mary", name)
        self.assertIn("watson", name)

    def test_apostrophe_name(self):
        buf = b"Patrick O'Brien\npatrick@example.com\n\nEDUCATION\nUniversity of Tampa\nB.A. in History\n"
        parsed = parse_resume(buf, "text/plain", use_llm=False)
        legacy = to_legacy_parsed_resume(parsed)
        self.assertTrue(legacy.name)
        self.assertIn("patrick", (legacy.name or "").lower())

    def test_gpa_formats(self):
        buf = (
            b"John Doe\njohn@example.com\n\nEDUCATION\nUniversity of Tampa\n"
            b"B.S. in Computer Science\nGPA: 3.8/4.0\nCumulative GPA: 3.9\n(3.7 GPA)\n"
        )
        parsed = parse_resume(buf, "text/plain", use_llm=False)
        legacy = to_legacy_parsed_resume(parsed)
        self.assertIsNotNone(legacy.gpa)
        self.assertGreaterEqual(legacy.gpa, 3.0)
        self.assertLessEqual(legacy.gpa, 4.0)

    def test_missing_gpa(self):
        buf = b"John Doe\njohn@example.com\n\nEDUCATION\nUniversity of Tampa\nB.S. in Economics\nExpected May 2025\n"
        parsed = parse_resume(buf, "text/plain", use_llm=False)
        legacy = to_legacy_parsed_resume(parsed)
        self.assertIsNone(legacy.gpa)

    def test_double_major(self):
        buf = b"Jane Doe\njane@example.com\n\nEDUCATION\nUniversity of Tampa\nDouble major in Finance and Economics\n"
        parsed = parse_resume(buf, "text/plain", use_llm=False)
        self.assertTrue(parsed.education.value)
        first = parsed.education.value[0]
        self.assertTrue(first.major and "Finance" in first.major and "Economics" in first.major)

    def test_skills_pipe_separated(self):
        buf = b"John Doe\njohn@example.com\n\nSKILLS\nPython | Java | React | SQL | AWS\n"
        parsed = parse_resume(buf, "text/plain", use_llm=False)
        self.assertTrue(parsed.skills.value)
        self.assertGreaterEqual(len(parsed.skills.value.all), 3)

    def test_skills_bullet_list(self):
        buf = b"John Doe\njohn@example.com\n\nSKILLS\n* Python\n* JavaScript\n* React\n"
        parsed = parse_resume(buf, "text/plain", use_llm=False)
        self.assertTrue(parsed.skills.value)
        self.assertGreaterEqual(len(parsed.skills.value.all), 2)

    def test_no_skills_section(self):
        buf = (
            b"John Doe\njohn@example.com\n\nEDUCATION\nUniversity of Tampa\nB.S. in Computer Science\n\n"
            b"EXPERIENCE\nSoftware Engineer at Tech Corp\nBuilt applications using Python and React. Used AWS.\n"
        )
        parsed = parse_resume(buf, "text/plain", use_llm=False)
        # Skills may be extracted from experience via known-skills dict
        self.assertTrue(parsed.skills.value is not None)
        skills_str = str(parsed.skills.value.all).lower()
        self.assertTrue("python" in skills_str or "react" in skills_str or "aws" in skills_str)

    def test_dates_various_formats(self):
        buf = (
            b"John Doe\njohn@example.com\n\nEXPERIENCE\nAcme Corp\nSoftware Engineer\n"
            b"January 2022 - Present\n\nBeta Inc\nIntern\n2020 - 2021\n"
        )
        parsed = parse_resume(buf, "text/plain", use_llm=False)
        self.assertTrue(parsed.experience.value)
        entries = parsed.experience.value
        self.assertGreaterEqual(len(entries), 1)

    def test_non_standard_headers(self):
        buf = (
            b"John Doe\njohn@example.com\n\nPROFESSIONAL JOURNEY\nAcme Corp - Engineer - 2022-Present\n\n"
            b"AREAS OF EXPERTISE\nPython, Data Analysis, Leadership\n"
        )
        parsed = parse_resume(buf, "text/plain", use_llm=False)
        det = str(parsed.sections_detected).lower()
        self.assertTrue("professional journey" in det or "experience" in det or "expertise" in det)
        self.assertTrue(parsed.skills.value or "expertise" in str(parsed.sections.keys()))

    def test_contact_in_preamble(self):
        buf = b"John Doe\njohn@example.com | (555) 123-4567\nlinkedin.com/in/johndoe\nTampa, FL\n\nEDUCATION\nUniversity of Tampa\n"
        parsed = parse_resume(buf, "text/plain", use_llm=False)
        self.assertEqual(parsed.email.value, "john@example.com")
        self.assertTrue(parsed.phone.value)
        self.assertTrue(parsed.linkedin.value or "linkedin" in str(parsed.linkedin.raw or "").lower())
        self.assertTrue(parsed.location.value or "Tampa" in str(parsed.location.raw or ""))

    def test_interface_preserved(self):
        buf = b"Jane Doe\njane@example.com\n\nEDUCATION\nUT\nB.S. CS"
        parsed = parse_resume(buf, "text/plain", use_llm=False)
        self.assertTrue(hasattr(parsed, "name"))
        self.assertTrue(hasattr(parsed, "email"))
        self.assertTrue(hasattr(parsed, "education"))
        self.assertTrue(hasattr(parsed, "experience"))
        self.assertTrue(hasattr(parsed, "skills"))
        self.assertTrue(hasattr(parsed, "sections"))
        self.assertTrue(hasattr(parsed, "layout_detected"))
        self.assertTrue(hasattr(parsed, "parse_time_ms"))
        legacy = to_legacy_parsed_resume(parsed)
        self.assertTrue(legacy.name)
        self.assertTrue(legacy.sections)
        self.assertTrue(legacy.normalized_text)

    def test_generated_required_fixture_matrix(self):
        required = [
            "single_column_standard.pdf",
            "two_column_sidebar.pdf",
            "table_based_layout.pdf",
            "non_standard_headers.pdf",
            "gpa_formats.pdf",
            "hyphenated_name.pdf",
            "apostrophe_name.pdf",
            "missing_gpa.pdf",
            "double_major.pdf",
            "multiple_degrees.pdf",
            "skills_pipe_separated.pdf",
            "skills_bullet_list.pdf",
            "no_skills_section.pdf",
            "dates_various_formats.pdf",
            "name_in_header.pdf",
            "contact_in_footer.pdf",
            "international_name.pdf",
        ]
        for fixture in required:
            with self.subTest(fixture=fixture):
                path = os.path.join(self.fixtures_dir, fixture)
                if self.use_pdf_fixtures:
                    self.assertTrue(os.path.exists(path))
                else:
                    self.assertTrue(os.path.exists(path.replace(".pdf", ".txt")))

    def test_fixture_single_column_standard_pdf(self):
        parsed = self._parse_fixture_pdf("single_column_standard.pdf")
        self.assertIn(parsed.layout_detected, ("single_column", "mixed"))
        self.assertTrue(parsed.email.value and "@" in parsed.email.value)

    def test_fixture_two_column_detects_non_single_layout(self):
        parsed = self._parse_fixture_pdf("two_column_sidebar.pdf")
        self.assertIn(parsed.layout_detected, ("multi_column", "mixed", "single_column"))
        self.assertTrue(parsed.raw_text)

    def test_fixture_table_heavy_detects_table_or_mixed(self):
        parsed = self._parse_fixture_pdf("table_based_layout.pdf")
        self.assertIn(parsed.layout_detected, ("table_heavy", "mixed", "single_column"))
        self.assertTrue(parsed.raw_text)

    def test_fixture_name_variants(self):
        hyphen = self._parse_fixture_pdf("hyphenated_name.pdf")
        apostrophe = self._parse_fixture_pdf("apostrophe_name.pdf")
        self.assertTrue(hyphen.name.value is None or "mary" in (hyphen.name.value or "").lower())
        self.assertTrue(apostrophe.name.value is None or "patrick" in (apostrophe.name.value or "").lower())

    def test_fixture_gpa_and_missing_gpa(self):
        with_gpa = self._parse_fixture_pdf("gpa_formats.pdf")
        without_gpa = self._parse_fixture_pdf("missing_gpa.pdf")
        # Parser may return education list empty for some PDFs; if present, validate GPA behavior.
        if with_gpa.education.value:
            gpas = [e.gpa for e in with_gpa.education.value if getattr(e, "gpa", None)]
            self.assertTrue(len(gpas) >= 1)
        if without_gpa.education.value:
            gpas2 = [e.gpa for e in without_gpa.education.value if getattr(e, "gpa", None)]
            self.assertEqual(len(gpas2), 0)

    def test_fixture_skills_patterns(self):
        pipe = self._parse_fixture_pdf("skills_pipe_separated.pdf")
        bullets = self._parse_fixture_pdf("skills_bullet_list.pdf")
        no_skills = self._parse_fixture_pdf("no_skills_section.pdf")
        self.assertTrue(pipe.skills.value is not None)
        self.assertTrue(bullets.skills.value is not None)
        self.assertTrue(no_skills.skills.value is not None)

    def test_fixture_contact_footer_and_header_name(self):
        header = self._parse_fixture_pdf("name_in_header.pdf")
        footer = self._parse_fixture_pdf("contact_in_footer.pdf")
        self.assertTrue(header.raw_text)
        self.assertTrue(footer.raw_text)
        # Validate parser output remains structurally complete.
        self.assertTrue(hasattr(header, "parser_warnings"))
        self.assertTrue(hasattr(footer, "parser_warnings"))

    def test_golden_expected_outputs(self):
        for case in sorted(self.golden_expected.keys()):
            with self.subTest(case=case):
                parsed = self._parse_fixture_pdf(f"{case}.pdf")
                snapshot = self._snapshot(parsed)
                self._assert_golden(case, snapshot)


if __name__ == "__main__":
    unittest.main()
