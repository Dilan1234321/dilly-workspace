# Parser test fixtures

Fixture behavior:

- When `reportlab` is available, parser tests auto-generate deterministic PDF fixtures in this folder.
- When `reportlab` is unavailable, tests auto-generate equivalent `.txt` fallback fixtures so coverage still runs.
- You can still place your own real PDF/DOCX files here to test production-like resumes.

Required scenario fixture names:

- `single_column_standard.pdf` — standard single-column layout
- `two_column_sidebar.pdf` — multi-column layout
- `table_based_layout.pdf` — table-heavy formatting
- `non_standard_headers.pdf` — professional journey, areas of expertise, etc.
- `gpa_formats.pdf` — 3.8/4.0, (3.8 GPA), Cumulative GPA: 3.8
- `hyphenated_name.pdf` — Mary-Jane Watson
- `apostrophe_name.pdf` — O'Brien
- `missing_gpa.pdf` — no GPA present
- `double_major.pdf` — two majors
- `multiple_degrees.pdf` — two education entries
- `skills_pipe_separated.pdf` — Python | Java | React
- `skills_bullet_list.pdf` — skills as bullets
- `no_skills_section.pdf` — skills only in experience
- `dates_various_formats.pdf` — date format variants
- `name_in_header.pdf` — name in PDF header
- `contact_in_footer.pdf` — contact in footer
- `international_name.pdf` — non-ASCII characters

Text-based tests run without fixtures. Add PDF/DOCX files to enable file-based tests.
