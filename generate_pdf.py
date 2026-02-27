from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.pdfgen import canvas
from reportlab.platypus.flowables import Flowable
import datetime

# ─── DATA 116 KONTAK ORANG TUA ────────────────────────────────────────────────
contacts = [
    (1, "6283129333818", "Adnan"),
    (2, "6283129333822", "Adnan Ulfah"),
    (3, "6287785034166", "Alika Hafiz"),
    (4, "6289653029561", "Alyssa Avicena"),
    (5, "6283135783133", "Ammar Danish Fb Cakung"),
    (6, "6289514785860", "Anasthasi Rizkita Fb"),
    (7, "6285591827687", "Anggoro Mama Naya"),
    (8, "6289679790877", "Anisya Marifah Fb Pulogadung"),
    (9, "6281292192146", "Annisa Min 7"),
    (10, "6285157552308", "Azzura"),
    (11, "628551856323", "Bahira"),
    (12, "6288298357410", "Bening"),
    (13, "6288976870378", "Boniyah"),
    (14, "6281210352071", "Bu De Susu Kacang"),
    (15, "6281382576022", "Clei 09 Kapuk"),
    (16, "6285213820456", "Denis"),
    (17, "6289509898474", "Denti"),
    (18, "6283170623970", "Desi Susanti Fian Fb Cakung"),
    (19, "6283155861239", "Dewi Anggraeni Fb Cakpul"),
    (20, "6289633628259", "Dewi Timbul"),
    (21, "62887433302100", "Dhafin 09"),
    (22, "6281240313573", "Dila Tri"),
    (23, "6285811359637", "Dina Ely"),
    (24, "6285886970323", "Dini Afif"),
    (25, "6281355330105", "Dini Dapur Dinwati Cakpul"),
    (26, "6285771269729", "Dirta Yasa Rt 02"),
    (27, "6285283214905", "Dita FB"),
    (28, "6281293888674", "Eka Sati"),
    (29, "6285816868005", "El Zavier Avicena"),
    (30, "6285861459682", "Ely Afif"),
    (31, "6289676071980", "Esih Ratna FB Cakung"),
    (32, "6285889988739", "Eva Fb Pulogadung"),
    (33, "6281906667631", "Fathir Min 7"),
    (34, "6285641411818", "Fendi"),
    (35, "62895333030897", "Fita Angesti Fb Cakung"),
    (36, "6288295121177", "Fitri Khairunnisa Fb Cakung"),
    (37, "6289529182717", "Galih Danis"),
    (38, "628131860698", "Hanna Rizal"),
    (39, "6282125632238", "Ibet Kladeo Fb Cakung"),
    (40, "6287765483181", "Iis Dawis Rt 04"),
    (41, "6281295889727", "Kak Erna"),
    (42, "6281295420827", "Keichi"),
    (43, "62895326310387", "Kiki Afif"),
    (44, "6287726466827", "Lia"),
    (45, "6285881272330", "Ma2 Afif Min 7"),
    (46, "6281529831830", "Ma2 Arjuna Cakung"),
    (47, "6287727897306", "Ma2 Baim"),
    (48, "628985851265", "Ma2 Bima Kedaung"),
    (49, "6285775361062", "Ma2 Fahri Kedaung"),
    (50, "6288973629190", "Ma2 Raja Fb Cakung"),
    (51, "6285281006717", "Mak Dea Rizky"),
    (52, "6281318392885", "Mamah Utet"),
    (53, "6287895658425", "Mamanya Bagas"),
    (54, "6285771623646", "Maryam"),
    (55, "6282125342113", "Mbak Nik"),
    (56, "6281389066191", "Mbak Sri Maheni"),
    (57, "62895326108964", "Mbak Sum"),
    (58, "6285693257520", "Mbak Yuni"),
    (59, "6285361621600", "Melly Fb Cakpul"),
    (60, "6281319086066", "Mi2 Maya"),
    (61, "6281212949820", "Miftah"),
    (62, "6285817437874", "Moms Ikky FB Cakung"),
    (63, "6285280382989", "Moza"),
    (64, "6285148221078", "Nabilah 12 Kka"),
    (65, "6285894098159", "Nabilah Nurbaiti Fb Cakpul"),
    (66, "6285641651549", "Naufal 12 Kka"),
    (67, "6281212985108", "Nauren 12 Kka"),
    (68, "6285779618481", "Nita Bilqis FB Kosambi"),
    (69, "62895333975796", "Nurhayati 12 Kka"),
    (70, "6285693344098", "Nurul Fb Pulogadung"),
    (71, "6282385963155", "Pelangi"),
    (72, "6287888020030", "Pia Mama Irul"),
    (73, "6281296876667", "Prapti Arie Witanto Fb"),
    (74, "6285882236237", "Rafa 12 Kka"),
    (75, "628568777720", "Rayhan 12 Kka 1A"),
    (76, "6281284462255", "Revalia Fb Cakung"),
    (77, "6289628398184", "Reza Afif"),
    (78, "6283876584682", "Rima Afif"),
    (79, "6281383172438", "Rindiani"),
    (80, "6283806605586", "Rosa Efari Fb"),
    (81, "6287889975309", "Royati Fb Pulogadung"),
    (82, "6281385258004", "Rya Rt 25"),
    (83, "628988673667", "Samsiyah Syam"),
    (84, "628816171722", "Santi Sadiah"),
    (85, "62895322275039", "Selfi Rono"),
    (86, "6281953438815", "Selly"),
    (87, "6287840017196", "Siti Nurhayati Fb Pulogadung"),
    (88, "628889518744", "Sri Ningsih FB Cakung"),
    (89, "62881024448132", "Syarifah Kembar"),
    (90, "6281291347381", "Tamy"),
    (91, "6289681775441", "Tante Bakso"),
    (92, "6288299913506", "Tante Carlissa"),
    (93, "6285718090272", "Tante Firman"),
    (94, "628568511113", "Tari"),
    (95, "6282299628158", "Tari Titin"),
    (96, "6281387892342", "Tasya"),
    (97, "6281324931498", "Warkaya"),
    (98, "62895402873118", "Wati"),
    (99, "6285891132740", "Wulan Dede Fb Pulogadung"),
    (100, "6285710695375", "Yandi Ambiya Rahman Fb Cakpul"),
    (101, "6285778711614", "Yani Kjp Cipinang"),
    (102, "6289501971204", "Yazra 12 Kka"),
    (103, "6285711033918", "Yuli Ambiya FB"),
    (104, "6287887250237", "Yuni Kedaung Fahri Bening"),
    (105, "6281289467481", "Yusna 12 Kka"),
    (106, "6285883667578", "Zahra 12 Kka"),
    (107, "62895332456927", "Zahra Yatun Fb"),
    (108, "6285280885800", "Denis 2"),
    (109, "6285697713241", "Heri Pulogadung Cust Nurul"),
    (110, "6285179558485", "Kayla"),
    (111, "6285693378288", "Mahardika 12 Kka"),
    (112, "6285179584852", "Nadia"),
    (113, "6281808124933", "Nakay Mart"),
    (114, "6288808569196", "Nesya Avicena"),
    (115, "6282169643265", "Srindayani Linda"),
    (116, "6282260195263", "Mama Rizal"),
]

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
        self.drawRightString(w - 2*cm, h - 52, f"Total: 116 Kontak")

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
OUTPUT = "Daftar_Kontak_Orang_Tua_KJP.pdf"

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
    "Dokumen ini memuat <b>116 nomor kontak</b> orang tua/wali peserta Program KJP. "
    "Data mencakup nama lengkap dan nomor WhatsApp yang terdaftar.",
    style_info
))
elements.append(HRFlowable(width="100%", thickness=1.2, color=PRIMARY, spaceAfter=6))
elements.append(Spacer(1, 3*mm))

# ── TABEL ───────────────────────────────────────────────────────────────────
col_widths = [1.1*cm, 6.0*cm, 9.4*cm]  # No | No HP | Nama

# Header baris
header = [
    Paragraph("<b>#</b>",    ParagraphStyle("hdr", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE, alignment=TA_CENTER)),
    Paragraph("<b>Nomor HP</b>",  ParagraphStyle("hdr", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE, alignment=TA_CENTER)),
    Paragraph("<b>Nama Orang Tua / Wali</b>", ParagraphStyle("hdr", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE, alignment=TA_LEFT)),
]

row_style_odd  = ParagraphStyle("rodd",  fontName="Helvetica", fontSize=8.5, textColor=DARK_TEXT, alignment=TA_CENTER, leading=12)
row_style_even = ParagraphStyle("reven", fontName="Helvetica", fontSize=8.5, textColor=DARK_TEXT, alignment=TA_CENTER, leading=12)
name_style_odd  = ParagraphStyle("nodd",  fontName="Helvetica", fontSize=8.5, textColor=DARK_TEXT, alignment=TA_LEFT, leading=12)
name_style_even = ParagraphStyle("neven", fontName="Helvetica", fontSize=8.5, textColor=DARK_TEXT, alignment=TA_LEFT, leading=12)

table_data = [header]
for no, hp, nama in contacts:
    s  = row_style_odd  if no % 2 == 1 else row_style_even
    ns = name_style_odd if no % 2 == 1 else name_style_even
    row = [
        Paragraph(str(no), s),
        Paragraph(hp, s),
        Paragraph(nama, ns),
    ]
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
    ("ROWBACKGROUNDS", (0, 0), (-1, 0), [PRIMARY]),

    # Data rows — zebra stripes
    ("TOPPADDING",    (0, 1), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
    ("LEFTPADDING",   (0, 0), (-1, -1), 6),
    ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
    ("VALIGN",        (0, 1), (-1, -1), "MIDDLE"),
    ("ALIGN",         (0, 1), (1, -1), "CENTER"),
    ("ALIGN",         (2, 1), (2, -1), "LEFT"),

    # Grid
    ("GRID",          (0, 0), (-1, -1), 0.4, colors.HexColor("#C5D5E8")),
    ("LINEBELOW",     (0, 0), (-1, 0), 2, PRIMARY_DARK),
    ("LINEABOVE",     (0, 0), (-1, 0), 0, colors.transparent),

    # Rounded-ish outer border
    ("BOX",           (0, 0), (-1, -1), 1.5, PRIMARY),
]

# Zebra stripes
for i, row in enumerate(contacts):
    no = row[0]
    row_idx = no  # data starts at index 1
    if no % 2 == 1:
        ts.append(("BACKGROUND", (0, row_idx), (-1, row_idx), SUBTLE_GRAY))
    else:
        ts.append(("BACKGROUND", (0, row_idx), (-1, row_idx), ROW_EVEN))

# Highlight baris ke-50 & ke-100 (milestone)
for milestone in [50, 100]:
    ts.append(("BACKGROUND", (0, milestone), (-1, milestone), colors.HexColor("#FFF9C4")))
    ts.append(("FONTNAME",   (0, milestone), (-1, milestone), "Helvetica-Bold"))
    ts.append(("TEXTCOLOR",  (0, milestone), (-1, milestone), colors.HexColor("#1565C0")))

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
    f"<b>Total Kontak: 116</b>  ·  Data per {datetime.datetime.now().strftime('%d %B %Y')}  ·  Dokumen ini bersifat rahasia",
    style_summary
))

# ── GENERATE ─────────────────────────────────────────────────────────────────
doc.build(elements, canvasmaker=NumberedCanvas)
print("PDF berhasil dibuat: " + str(OUTPUT))
