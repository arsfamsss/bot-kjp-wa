from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.pdfgen import canvas
from reportlab.platypus.flowables import Flowable
import datetime
import csv
import os

# ─── LOAD DATA FROM CSV ──────────────────────────────────────────────────────────
def load_contacts_from_csv(file_path):
    contacts_map = {}  # Using map to deduplicate by No HP (1 No HP = 1 baris)
    if not os.path.exists(file_path):
        print(f"Warning: File {file_path} tidak ditemukan.")
        return []
    
    try:
        with open(file_path, mode='r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                nama_raw = row.get('nama', '').strip()
                no_hp = row.get('no_hp', '').strip()
                
                if not no_hp:
                    continue
                
                # Parsing nama: Ambil teks sebelum tanda (
                nama_clean = nama_raw.split('(')[0].strip()
                
                # Deduplicate: 1 No HP = 1 baris (keep the first one found or overwrite, request says 1 No HP = 1 line)
                if no_hp not in contacts_map:
                    contacts_map[no_hp] = nama_clean
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return []
    
    # Convert to list and sort alphabetically by name
    sorted_contacts = []
    for no_hp, name in contacts_map.items():
        sorted_contacts.append({"name": name, "no_hp": no_hp})
    
    sorted_contacts.sort(key=lambda x: x["name"].lower())
    
    # Format into (index, no_hp, name) for compatibility with existing code
    final_contacts = []
    for i, c in enumerate(sorted_contacts, start=1):
        final_contacts.append((i, c["no_hp"], c["name"]))
    return final_contacts

CSV_PATH = r"D:\BOT\PERSIAPAN HARIAN KJP\data_no_kjp.csv"
contacts = load_contacts_from_csv(CSV_PATH)

# ─── WARNA PALETTE ────────────────────────────────────────────────────────────
PRIMARY      = colors.HexColor("#1565C0")   # biru tua
PRIMARY_DARK = colors.HexColor("#0D47A1")   # biru lebih tua
ACCENT       = colors.HexColor("#E3F2FD")   # biru muda (baris ganjil)
WHITE        = colors.white
DARK_TEXT    = colors.HexColor("#1A1A2E")
SUBTLE_GRAY  = colors.HexColor("#F5F7FA")
ROW_EVEN     = colors.HexColor("#EEF4FF")   # biru sangat muda (baris genap)
GOLD         = colors.HexColor("#FFD700")

# ─── CANVAS CALLBACK (header / footer setiap halaman) ─────────────────────────
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for page_num, state in enumerate(self._saved_page_states, start=1):
            self.__dict__.update(state)
            self.draw_page(page_num, num_pages)
            super().showPage()
        super().save()

    def draw_page(self, page_num, total_pages):
        # page_num already passed as argument
        w, h = A4

        # ── HEADER BAR ──────────────────────────────────────────────────────
        self.setFillColor(PRIMARY_DARK)
        self.rect(0, h - 60, w, 60, fill=True, stroke=False)

        # Garis emas tipis di bawah header
        self.setFillColor(GOLD)
        self.rect(0, h - 63, w, 3, fill=True, stroke=False)

        # Teks header
        self.setFillColor(WHITE)
        self.setFont("Helvetica-Bold", 15)
        self.drawString(2*cm, h - 38, "DAFTAR KONTAK ORANG TUA")
        self.setFont("Helvetica", 8.5)
        self.drawString(2*cm, h - 52, "Data Nomor HP & Nama  |  Program KJP")

        # Nomor halaman (kanan atas)
        self.setFont("Helvetica", 8)
        self.drawRightString(w - 2*cm, h - 38, f"Halaman {page_num} / {total_pages}")
        self.drawRightString(w - 2*cm, h - 52, f"Total: {len(contacts)} Kontak")

        # ── FOOTER BAR ──────────────────────────────────────────────────────
        self.setFillColor(PRIMARY_DARK)
        self.rect(0, 0, w, 28, fill=True, stroke=False)
        self.setFillColor(GOLD)
        self.rect(0, 28, w, 2, fill=True, stroke=False)

        self.setFillColor(WHITE)
        self.setFont("Helvetica", 7.5)
        tanggal = datetime.datetime.now().strftime("%d %B %Y")
        self.drawString(2*cm, 10, f"Dicetak: {tanggal}   |   Dokumen Rahasia — Hanya untuk keperluan internal")
        self.drawRightString(w - 2*cm, 10, "Program KJP — Data Orang Tua")


# ─── BUILD PDF ────────────────────────────────────────────────────────────────
OUTPUT = "CetakPDF_Update_data_no_kjp.pdf"

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    topMargin=70,
    bottomMargin=38,
    leftMargin=1.8*cm,
    rightMargin=1.8*cm,
)

styles = getSampleStyleSheet()

# ── SUB-HEADER INFO ─────────────────────────────────────────────────────────
style_info = ParagraphStyle(
    "info",
    fontName="Helvetica",
    fontSize=9,
    textColor=colors.HexColor("#555555"),
    alignment=TA_LEFT,
    spaceAfter=6,
)
style_title_box = ParagraphStyle(
    "titlebox",
    fontName="Helvetica-Bold",
    fontSize=11,
    textColor=PRIMARY_DARK,
    alignment=TA_LEFT,
    spaceBefore=4,
    spaceAfter=2,
)

elements = []

# Info ringkas
elements.append(Spacer(1, 4*mm))
elements.append(Paragraph("📋  Rekapitulasi Nomor Kontak Orang Tua — Program KJP", style_title_box))
elements.append(Paragraph(
    f"Dokumen ini memuat <b>{len(contacts)} nomor kontak</b> orang tua/wali peserta Program KJP. "
    "Data mencakup nama lengkap dan nomor WhatsApp yang terdaftar.",
    style_info
))
elements.append(HRFlowable(width="100%", thickness=1.2, color=PRIMARY, spaceAfter=6))
elements.append(Spacer(1, 3*mm))

# ── TABEL ───────────────────────────────────────────────────────────────────
col_widths = [0.8*cm, 3.2*cm, 4.5*cm, 0.8*cm, 3.2*cm, 4.5*cm]  # No | No HP | Nama | No | No HP | Nama

# Header baris
header_cell_style_center = ParagraphStyle("hdr_c", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE, alignment=TA_CENTER)
header_cell_style_left   = ParagraphStyle("hdr_l", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE, alignment=TA_LEFT)

header = [
    Paragraph("<b>#</b>", header_cell_style_center),
    Paragraph("<b>Nomor HP</b>", header_cell_style_center),
    Paragraph("<b>Nama</b>", header_cell_style_left),
    Paragraph("<b>#</b>", header_cell_style_center),
    Paragraph("<b>Nomor HP</b>", header_cell_style_center),
    Paragraph("<b>Nama</b>", header_cell_style_left),
]

row_style = ParagraphStyle("rs", fontName="Helvetica", fontSize=8.5, textColor=DARK_TEXT, alignment=TA_CENTER, leading=11)
name_style = ParagraphStyle("ns", fontName="Helvetica", fontSize=8.5, textColor=DARK_TEXT, alignment=TA_LEFT, leading=11)

# Bagi data menjadi 2 bagian (kiri dan kanan)
half = (len(contacts) + 1) // 2
left_part = contacts[:half]
right_part = contacts[half:]

table_data = [header]
for i in range(half):
    # Data Kiri
    c1 = left_part[i]
    row = [
        Paragraph(str(c1[0]), row_style),
        Paragraph(c1[1], row_style),
        Paragraph(c1[2], name_style),
    ]
    
    # Data Kanan
    if i < len(right_part):
        c2 = right_part[i]
        row.extend([
            Paragraph(str(c2[0]), row_style),
            Paragraph(c2[1], row_style),
            Paragraph(c2[2], name_style),
        ])
    else:
        row.extend([Paragraph("", row_style), Paragraph("", row_style), Paragraph("", name_style)])
        
    table_data.append(row)

tbl = Table(table_data, colWidths=col_widths, repeatRows=1)

# Bangun style tabel
ts = [
    # Header
    ("BACKGROUND",  (0, 0), (-1, 0), PRIMARY),
    ("TEXTCOLOR",   (0, 0), (-1, 0), WHITE),
    ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE",    (0, 0), (-1, 0), 9),
    ("ALIGN",       (0, 0), (-1, 0), "CENTER"),
    ("VALIGN",      (0, 0), (-1, 0), "MIDDLE"),
    ("TOPPADDING",  (0, 0), (-1, 0), 7),
    ("BOTTOMPADDING", (0, 0), (-1, 0), 7),

    # Data rows — layout settings
    ("TOPPADDING",    (0, 1), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
    ("LEFTPADDING",   (0, 0), (-1, -1), 4),
    ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
    ("VALIGN",        (0, 1), (-1, -1), "MIDDLE"),
    
    # Grid
    ("GRID",          (0, 0), (-1, -1), 0.4, colors.HexColor("#C5D5E8")),
    ("LINEBELOW",     (0, 0), (-1, 0), 2, PRIMARY_DARK),
    
    # Rounded-ish outer border
    ("BOX",           (0, 0), (-1, -1), 1.5, PRIMARY),
]

# Zebra stripes & Milestones (50 & 100)
for r_idx in range(1, len(table_data)):
    # Background
    if r_idx % 2 == 1:
        ts.append(("BACKGROUND", (0, r_idx), (-1, r_idx), SUBTLE_GRAY))
    else:
        ts.append(("BACKGROUND", (0, r_idx), (-1, r_idx), ROW_EVEN))
    
tbl.setStyle(TableStyle(ts))
elements.append(tbl)

# ── RINGKASAN DI BAWAH TABEL ─────────────────────────────────────────────────
elements.append(Spacer(1, 5*mm))
elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#BBDEFB"), spaceAfter=4))

style_summary = ParagraphStyle(
    "summary",
    fontName="Helvetica",
    fontSize=8.5,
    textColor=colors.HexColor("#444"),
    alignment=TA_CENTER,
    leading=14,
)
elements.append(Paragraph(
    f"<b>Total Kontak: {len(contacts)}</b>  ·  Data per {datetime.datetime.now().strftime('%d %B %Y')}  ·  Dokumen ini bersifat rahasia",
    style_summary
))

# ── GENERATE ─────────────────────────────────────────────────────────────────
doc.build(elements, canvasmaker=NumberedCanvas)
print("PDF berhasil dibuat: " + str(OUTPUT))
