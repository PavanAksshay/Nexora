"""Regression test suite for resume extraction pipeline."""

import pytest
import resume_analyzer

ADITI_SHARMA_RESUME_TEXT = """
Aditi Sharma
aditi.sharma.cs@gmail.com | +91 98xxxxxx01 | Bengaluru

SUMMARY:
Final-year Computer Science student with hands-on experience building full stack web applications using the MERN stack. Completed a 3-month internship building customer-facing features end to end.

EDUCATION:
B.E. Computer Science, RV College of Engineering, Bengaluru (2023-2027), CGPA: 8.7/10

SKILLS:
JavaScript (ES6+), React.js, Redux, Node.js, Express.js, MongoDB, REST APIs, Git/GitHub, HTML5/CSS3, Tailwind CSS, basic AWS (EC2, S3), Jest

EXPERIENCE:
Software Development Intern, Zenith Web Labs (Jun-Aug 2026)
- Built 4 new React components for the customer dashboard, integrated with existing REST APIs
- Developed Node.js/Express backend endpoints for a notifications module, tested with Jest
- Worked in a 2-week sprint cycle using Jira and participated in daily standups

PROJECTS:
Campus Marketplace (MERN Stack)
- Built a full stack peer-to-peer marketplace app with React frontend and Node/Express/MongoDB backend
- Implemented JWT-based authentication and role-based access control
- Deployed on Render (backend) and Vercel (frontend); used GitHub Actions for CI

Real-time Chat App
- Built a chat application using Socket.io, React, and Express with MongoDB for message persistence

CERTIFICATIONS:
- Meta Front-End Developer (Coursera)
- MongoDB Basics (MongoDB University)
"""


def test_aditi_sharma_resume_extraction():
    candidate = resume_analyzer.extract_candidate_entities(
        ADITI_SHARMA_RESUME_TEXT, "Aditi_Sharma_Resume.pdf"
    )

    # 1. Identity & Contact Details
    assert candidate["name"] == "Aditi Sharma"
    assert candidate["email"] == "aditi.sharma.cs@gmail.com"
    assert "Bengaluru" in candidate["location"]

    # 2. Summary Verification
    assert candidate["summary"] != ""
    assert not candidate["summary"].upper().startswith("SUMMARY")
    assert "Final-year Computer Science student" in candidate["summary"]

    # 3. Education Verification
    assert len(candidate["education"]) > 0
    edu_insts = [e["institution"] for e in candidate["education"]]
    assert any("RV College of Engineering" in inst for inst in edu_insts)
    edu_details = " ".join(e["details"] for e in candidate["education"])
    assert "8.7" in edu_details

    # 4. Experience Verification
    assert len(candidate["work_history"]) > 0
    exp_companies = [w["company"] for w in candidate["work_history"]]
    assert any("Zenith Web Labs" in comp for comp in exp_companies)
    assert candidate["work_history"][0]["role"] == "Software Development Intern"
    assert not any("PixelCraft Studio" in comp for comp in exp_companies)

    # 5. Projects Verification
    assert len(candidate["projects"]) >= 2
    proj_titles = [p["title"] for p in candidate["projects"]]
    assert any("Campus Marketplace" in t for t in proj_titles)
    assert any("Real-time Chat App" in t for t in proj_titles)
    assert not any("Campus Events Portal" in t for t in proj_titles)
    assert not any("Student Expense Tracker" in t for t in proj_titles)

    # 6. Skills Verification
    skills = candidate["skills"]
    expected_skills = [
        "React.js",
        "JavaScript",
        "Node.js",
        "Express.js",
        "MongoDB",
        "Jest",
        "Tailwind CSS",
        "AWS",
        "EC2",
        "S3",
        "Redux",
        "REST APIs",
    ]
    for expected in expected_skills:
        assert any(
            expected.lower() in s.lower() for s in skills
        ), f"Missing skill: {expected} in {skills}"

    # 7. Certifications Verification
    if "certifications" in candidate:
        assert len(candidate["certifications"]) >= 2
        certs_str = " ".join(candidate["certifications"])
        assert "Meta Front-End Developer" in certs_str
        assert "MongoDB Basics" in certs_str
