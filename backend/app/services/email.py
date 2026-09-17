"""Pluggable email boundary with development logging and SMTP providers.

The service owns two distinct email shapes used by the downstream pipeline:

1. Technical assessment invitation, sent when an OA is generated and the
   candidate-specific invite is created.
2. Round 3 progression email, sent automatically when a recruiter selects a
   candidate for the next interview stage.

No credentials are committed. SMTP configuration is read from environment only.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol


class EmailMessage:
    """Exact outbound email payload recorded or sent by the provider."""

    def __init__(
        self,
        recipient: str,
        subject: str,
        body: str,
        assessment_url: str | None,
        message_type: str,
        sent: bool,
    ) -> None:
        self.recipient = recipient
        self.subject = subject
        self.body = body
        self.assessment_url = assessment_url
        self.message_type = message_type
        self.sent = sent

    def __repr__(self) -> str:
        return (
            f"EmailMessage(recipient={self.recipient!r}, subject={self.subject!r}, "
            f"type={self.message_type!r}, sent={self.sent})"
        )


class EmailService(Protocol):
    def send_assessment_invitation(
        self,
        recipient: str,
        candidate_name: str,
        job_title: str,
        assessment_url: str | None,
    ) -> EmailMessage: ...

    def send_round3_invitation(
        self,
        recipient: str,
        candidate_name: str,
        job_title: str,
        interview_details: str | None,
    ) -> EmailMessage: ...


class LoggingEmailService:
    """Records exact development email payloads without sending mail."""

    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []

    def send_assessment_invitation(
        self,
        recipient: str,
        candidate_name: str,
        job_title: str,
        assessment_url: str | None,
    ) -> EmailMessage:
        message = _assessment_email(
            recipient=recipient,
            candidate_name=candidate_name,
            job_title=job_title,
            assessment_url=assessment_url,
            sent=True,
        )
        self.messages.append(message)
        return message

    def send_round3_invitation(
        self,
        recipient: str,
        candidate_name: str,
        job_title: str,
        interview_details: str | None,
    ) -> EmailMessage:
        message = _round3_email(
            recipient=recipient,
            candidate_name=candidate_name,
            job_title=job_title,
            interview_details=interview_details,
            sent=True,
        )
        self.messages.append(message)
        return message


class SMTPEmailService:
    """STD email provider used for demo/prod when configured."""

    def __init__(
        self,
        host: str,
        port: int,
        username: str | None,
        password: str | None,
        from_email: str,
        from_name: str,
    ) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.from_email = from_email
        self.from_name = from_name

    def send_assessment_invitation(
        self,
        recipient: str,
        candidate_name: str,
        job_title: str,
        assessment_url: str | None,
    ) -> EmailMessage:
        message = _assessment_email(
            recipient=recipient,
            candidate_name=candidate_name,
            job_title=job_title,
            assessment_url=assessment_url,
            sent=True,
        )
        _send_smtp(self, message)
        return message

    def send_round3_invitation(
        self,
        recipient: str,
        candidate_name: str,
        job_title: str,
        interview_details: str | None,
    ) -> EmailMessage:
        message = _round3_email(
            recipient=recipient,
            candidate_name=candidate_name,
            job_title=job_title,
            interview_details=interview_details,
            sent=True,
        )
        _send_smtp(self, message)
        return message


def _assessment_email(
    recipient: str,
    candidate_name: str,
    job_title: str,
    assessment_url: str | None,
    sent: bool,
) -> EmailMessage:
    link = assessment_url or "[assessment link unavailable]"
    body = (
        f"Dear {candidate_name},\n\n"
        f"Thank you for your interest in the {job_title} position.\n\n"
        f"As the next step in our selection process, we would like you to complete "
        f"a technical assessment designed around the technical requirements of the role.\n\n"
        f"Assessment: {job_title} Technical Assessment\n"
        f"Duration: approximately 60 minutes\n"
        f"Questions: 2-3\n\n"
        f"Assessment Link:\n{link}\n\n"
        f"Please complete the assessment independently within the allotted time.\n\n"
        f"Best regards,\nNexora Hiring Team"
    )
    return EmailMessage(
        recipient=recipient,
        subject=f"Technical Assessment Invitation - {job_title} | Nexora",
        body=body,
        assessment_url=assessment_url,
        message_type="assessment_invitation",
        sent=sent,
    )


def _round3_email(
    recipient: str,
    candidate_name: str,
    job_title: str,
    interview_details: str | None,
    sent: bool,
) -> EmailMessage:
    details = interview_details or (
        "The interview details will be coordinated by the Nexora recruiting team."
    )
    body = (
        f"Dear {candidate_name},\n\n"
        f"Congratulations!\n\n"
        f"You have successfully progressed to the next stage of our selection process "
        f"for the {job_title} position.\n\n"
        f"We would like to invite you to the Round 3 interview.\n\n"
        f"Interview details:\n{details}\n\n"
        f"We look forward to speaking with you.\n\n"
        f"Best regards,\nNexora Hiring Team"
    )
    return EmailMessage(
        recipient=recipient,
        subject=f"Round 3 Interview Invitation - {job_title} | Nexora",
        body=body,
        assessment_url=None,
        message_type="round3_invitation",
        sent=sent,
    )


def _send_smtp(service: SMTPEmailService, message: EmailMessage) -> None:
    import smtplib
    from email.mime.text import MIMEText

    msg = MIMEText(message.body, "plain", "utf-8")
    msg["Subject"] = message.subject
    msg["From"] = f"{service.from_name} <{service.from_email}>"
    msg["To"] = message.recipient

    with smtplib.SMTP(service.host, service.port, timeout=15) as smtp:
        smtp.starttls()
        if service.username and service.password:
            smtp.login(service.username, service.password)
        smtp.sendmail(service.from_email, [message.recipient], msg.as_string())


def build_email_service(mode: str) -> EmailService:
    if mode == "logging":
        return LoggingEmailService()

    if mode == "smtp":
        host = os.getenv("SMTP_HOST", "").strip()
        port_text = os.getenv("SMTP_PORT", "587").strip()
        username = os.getenv("SMTP_USERNAME")
        password = os.getenv("SMTP_PASSWORD")
        from_email = os.getenv("SMTP_FROM_EMAIL", "").strip()
        from_name = os.getenv("SMTP_FROM_NAME", "Nexora Hiring Team")

        if not host:
            raise RuntimeError("SMTP_HOST is required when EMAIL_MODE=smtp")
        try:
            port = int(port_text)
        except ValueError as exc:
            raise RuntimeError("SMTP_PORT must be an integer") from exc
        if not from_email:
            raise RuntimeError("SMTP_FROM_EMAIL is required when EMAIL_MODE=smtp")
        return SMTPEmailService(
            host=host,
            port=port,
            username=username.strip() or None,
            password=password,
            from_email=from_email,
            from_name=from_name,
        )

    raise RuntimeError(
        f"Email provider '{mode}' is not configured; use logging or smtp mode"
    )
