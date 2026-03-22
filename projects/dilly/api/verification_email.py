"""
Verification code email: school-themed, exciting, not corporate.
Uses school config (UTampa etc.) for colors and copy. Fallback for unknown .edu.
"""

from __future__ import annotations


def build_verification_email_html(code: str, school: dict | None) -> str:
    """Build HTML body for verification email. code is 6-digit; school from get_school_from_email or None."""
    primary = (school or {}).get("primary") or "#6366f1"
    secondary = (school or {}).get("secondary") or "#f59e0b"
    headline = (school or {}).get("email_headline") or "Your future starts with one step."
    subhead = (school or {}).get("email_subhead") or "Welcome to Dilly"
    name = (school or {}).get("name") or "Dilly"
    mascot = (school or {}).get("mascot_name") or "you"

    # Inline CSS for email clients; single column, big code, school colors
    return f"""<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Dilly code</title>
</head>
<body style="margin:0; padding:0; background-color:#0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0f172a; min-height:100vh;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" style="max-width: 440px;">
          <tr>
            <td style="text-align: center; padding-bottom: 24px;">
              <span style="font-size: 28px; font-weight: 700; color: {primary}; letter-spacing: -0.02em;">Dilly</span>
            </td>
          </tr>
          <tr>
            <td style="background-color: #1e293b; border-radius: 16px; padding: 32px 24px; border: 2px solid {primary};">
              <p style="margin:0 0 8px 0; font-size: 20px; font-weight: 700; color: #f8fafc; line-height: 1.3;">{headline}</p>
              <p style="margin:0 0 24px 0; font-size: 15px; color: #94a3b8; line-height: 1.5;">{subhead}</p>
              <p style="margin:0 0 8px 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em;">Your verification code</p>
              <p style="margin:0; font-size: 36px; font-weight: 800; letter-spacing: 0.2em; color: #f8fafc;">{code}</p>
              <p style="margin: 20px 0 0 0; font-size: 13px; color: #64748b;">Code expires in 10 minutes. No spam. We're just making sure it's you.</p>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 24px; text-align: center;">
              <p style="margin:0; font-size: 12px; color: #475569;">Built for students. We don't sell your data to recruiters.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def build_verification_email_subject(school: dict | None) -> str:
    """Subject line: short, exciting, not 'Your verification code' corporate."""
    return "Your Dilly code is in. Let's go."
