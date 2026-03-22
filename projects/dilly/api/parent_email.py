"""
Email content for parent-facing messages: report shared, milestone notifications.
"""


def build_report_shared_subject(student_name: str) -> str:
    return f"{student_name or 'Your student'} shared their Dilly report with you"


def build_report_shared_html(student_name: str, report_url: str) -> str:
    name = (student_name or "Your student").strip() or "Your student"
    return f"""<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0; padding:0; background-color:#0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0f172a; min-height:100vh;">
    <tr><td align="center" style="padding: 40px 20px;">
      <table role="presentation" width="100%" style="max-width: 440px;">
        <tr><td style="text-align: center; padding-bottom: 24px;"><span style="font-size: 24px; font-weight: 700; color: #c9a882;">Dilly</span></td></tr>
        <tr><td style="background-color: #1e293b; border-radius: 16px; padding: 32px 24px;">
          <p style="margin:0 0 8px 0; font-size: 18px; font-weight: 700; color: #f8fafc;">{name} shared their Dilly report with you</p>
          <p style="margin:0 0 24px 0; font-size: 14px; color: #94a3b8;">The report includes their resume scores (Smart, Grit, Build), evidence, and recommendations. The link is valid for 7 days.</p>
          <p style="margin:0;"><a href="{report_url}" style="display: inline-block; padding: 12px 24px; background: #c9a882; color: #080808; font-weight: 600; text-decoration: none; border-radius: 8px;">View report</a></p>
        </td></tr>
        <tr><td style="padding-top: 24px; text-align: center;"><p style="margin:0; font-size: 12px; color: #475569;">Dilly · The career center in your pocket. We don't sell your data.</p></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def build_milestone_subject(milestone_type: str, student_name: str) -> str:
    if milestone_type == "first_audit":
        return f"{student_name or 'Your student'} completed their first Dilly audit"
    if milestone_type == "strong_dimension":
        return f"{student_name or 'Your student'} reached Strong in a dimension"
    return "Update from Dilly"


def build_milestone_html(milestone_type: str, student_name: str, extra: dict | None) -> str:
    name = (student_name or "Your student").strip() or "Your student"
    extra = extra or {}
    if milestone_type == "first_audit":
        line = "completed their first Dilly resume audit. They now have Smart, Grit, and Build scores and tailored recommendations."
    elif milestone_type == "strong_dimension":
        dim = extra.get("dimension") or "a dimension"
        line = f"reached Strong in {dim}. Great progress on their resume."
    else:
        line = "has an update from Dilly."
    return f"""<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0; padding:0; background-color:#0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0f172a; min-height:100vh;">
    <tr><td align="center" style="padding: 40px 20px;">
      <table role="presentation" width="100%" style="max-width: 440px;">
        <tr><td style="text-align: center; padding-bottom: 24px;"><span style="font-size: 24px; font-weight: 700; color: #c9a882;">Dilly</span></td></tr>
        <tr><td style="background-color: #1e293b; border-radius: 16px; padding: 32px 24px;">
          <p style="margin:0 0 8px 0; font-size: 18px; font-weight: 700; color: #f8fafc;">{name} {line}</p>
          <p style="margin: 20px 0 0 0; font-size: 13px; color: #64748b;">You're receiving this because they added you as a parent contact and opted in to milestone updates.</p>
        </td></tr>
        <tr><td style="padding-top: 24px; text-align: center;"><p style="margin:0; font-size: 12px; color: #475569;">Dilly · We don't sell your data.</p></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
