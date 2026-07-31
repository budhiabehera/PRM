"""
SMTP Email Service — sends welcome emails to new users with their credentials.
Configured from Admin > Settings > SMTP section.
"""
import smtplib
import string
import random
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def generate_random_password(length: int = 10) -> str:
    """Generate a random password with letters, digits, and special chars."""
    chars = string.ascii_letters + string.digits + "!@#$%&*"
    return ''.join(random.choices(chars, k=length))


def _build_welcome_html(full_name: str, username: str, password: str,
                        role: str, login_url: str, company_logo: str) -> str:
    """Build a professional HTML welcome email."""
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:30px 40px;text-align:center;">
              <img src="{company_logo}" alt="Company Logo" style="max-height:50px;margin-bottom:15px;" />
              <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:600;">Welcome to PRM</h1>
              <p style="color:#94a3b8;margin:5px 0 0;font-size:13px;">Project & Resource Management</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="color:#334155;font-size:16px;margin:0 0 20px;">Hello <strong>{full_name}</strong>,</p>
              
              <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 25px;">
                Your account has been created on the PRM system. Below are your login credentials. 
                Please change your password after your first login.
              </p>

              <!-- Credentials Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:0 0 25px;">
                <tr>
                  <td style="padding:20px 25px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;color:#64748b;font-size:12px;text-transform:uppercase;font-weight:600;width:120px;">Username</td>
                        <td style="padding:8px 0;color:#1e293b;font-size:15px;font-weight:600;">{username}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#64748b;font-size:12px;text-transform:uppercase;font-weight:600;">Password</td>
                        <td style="padding:8px 0;color:#1e293b;font-size:15px;font-weight:600;font-family:monospace;background:#fff;padding:8px 12px;border-radius:4px;border:1px dashed #cbd5e1;">{password}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#64748b;font-size:12px;text-transform:uppercase;font-weight:600;">Role</td>
                        <td style="padding:8px 0;color:#4f46e5;font-size:14px;font-weight:600;">{role}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Login Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:10px 0 25px;">
                    <a href="{login_url}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;padding:12px 35px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.3px;">
                      Login to PRM
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0;border-top:1px solid #e2e8f0;padding-top:20px;">
                ⚠️ This is an auto-generated email. Please do not share your credentials with anyone.
                If you did not expect this email, please contact your administrator.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="color:#94a3b8;font-size:11px;margin:0;">
                &copy; 2026 PRM — Project & Resource Management. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def send_welcome_email(
    to_email: str,
    full_name: str,
    username: str,
    password: str,
    role: str,
    smtp_host: str,
    smtp_port: int,
    smtp_username: str,
    smtp_password: str,
    from_email: str,
    from_name: str = "PRM System",
    use_tls: bool = True,
    login_url: str = "http://localhost:5173/login",
    company_logo: str = "",
) -> tuple[bool, str]:
    """Send welcome email with credentials to a new user.
    Returns (success, message).
    """
    if not smtp_host or not to_email:
        return False, "SMTP not configured or no recipient email."

    html_body = _build_welcome_html(full_name, username, password, role, login_url, company_logo)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Welcome to PRM — Your Account is Ready"
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_email

    # Plain text fallback
    text_body = (
        f"Hello {full_name},\\n\\n"
        f"Your PRM account has been created.\\n"
        f"Username: {username}\\n"
        f"Password: {password}\\n"
        f"Role: {role}\\n\\n"
        f"Login at: {login_url}\\n\\n"
        f"Please change your password after first login."
    )

    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        if use_tls:
            server = smtplib.SMTP(smtp_host, smtp_port)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port)

        server.login(smtp_username, smtp_password)
        server.send_message(msg)
        server.quit()
        return True, f"Welcome email sent to {to_email}"
    except Exception as exc:
        return False, f"Failed to send email: {exc}"
