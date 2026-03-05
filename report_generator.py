import os
import datetime
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

class MeridianCohortReport:
    def __init__(self, df, cohort_name="University of Tampa - Alpha Cohort"):
        self.df = df
        self.cohort_name = cohort_name
        self.timestamp = datetime.datetime.now().strftime("%Y-%m-%d")
        self.filename = f"meridian_cohort_audit_{self.timestamp}.pdf"

    def generate(self):
        doc = SimpleDocTemplate(self.filename, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []

        # Title
        story.append(Paragraph(f"<font size=24 color='#2E5BFF'>MERIDIAN COHORT AUDIT</font>", styles['Title']))
        story.append(Paragraph(f"<font size=14>{self.cohort_name}</font>", styles['Subtitle']))
        story.append(Spacer(1, 12))
        story.append(Paragraph(f"<b>Date:</b> {self.timestamp}", styles['Normal']))
        story.append(Paragraph(f"<b>Audit Standard:</b> Meridian Meritocracy v3 (Zero-Bias)", styles['Normal']))
        story.append(Spacer(1, 24))

        # Executive Summary
        story.append(Paragraph("Executive Summary", styles['Heading2']))
        story.append(Paragraph(f"This audit encompasses {len(self.df)} candidates. Scoring is peer-relative, normalizing Smart (Academic), Grit (Leadership), and Build (Technical) signals against the cohort's high-performers.", styles['Normal']))
        story.append(Spacer(1, 12))

        # The Leaderboard Table
        data = [["Candidate", "GPA", "Smart", "Grit", "Build", "Meridian Score"]]
        for _, row in self.df.iterrows():
            gpa_display = f"{row['gpa']:.2f} ({'HS' if row['is_hs'] else 'Univ'})"
            data.append([
                row['name'][:20],
                gpa_display,
                f"{row['smart_raw_score']:.1f}",
                f"{row['grit_raw_score']:.1f}",
                f"{row['build_raw_score']:.1f}",
                f"{row['Meridian_Score']:.2f}"
            ])

        t = Table(data, colWidths=[120, 80, 60, 60, 60, 100])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2E5BFF')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
        ]))
        story.append(t)
        story.append(Spacer(1, 24))

        # Insights Section
        story.append(Paragraph("Cohort Insights", styles['Heading2']))
        top_smart = self.df.sort_values(by="smart_raw_score", ascending=False).iloc[0]['name']
        top_grit = self.df.sort_values(by="grit_raw_score", ascending=False).iloc[0]['name']
        top_build = self.df.sort_values(by="build_raw_score", ascending=False).iloc[0]['name']
        
        story.append(Paragraph(f"• <b>Academic Benchmark (Smart):</b> {top_smart}", styles['Normal']))
        story.append(Paragraph(f"• <b>Leadership Benchmark (Grit):</b> {top_grit}", styles['Normal']))
        story.append(Paragraph(f"• <b>Technical Benchmark (Build):</b> {top_build}", styles['Normal']))
        story.append(Spacer(1, 24))

        # Footer
        story.append(Paragraph("<i>Confidential Meridian Audit Report - For Internal Strategic Use Only.</i>", styles['Italic']))

        doc.build(story)
        print(f"Cohort report generated: {self.filename}")
        return self.filename

# Update the engine to call the report generator
if __name__ == "__main__":
    # This would be appended or imported in peer_score_engine_v3.py
    pass
