import tkinter as tk
import ctypes
import ctypes.wintypes as wintypes
import random
import time
import math
import threading
import winsound

user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32

# ======================================================================
# CONFIGURATION DES STADES & PROGRESSION DE LA TENSION
# ======================================================================
ENABLE_SCREEN_CRACKS = True  # True pour garder l'effet fissures d'écran cassé, False pour écran sans fissures

# Durée de chaque stade en secondes (ajustable facilement)
STAGE_DURATIONS = {
    3: 16.0,  # STADE 3 : Fausse page PayPal montrant des débits monstrueux en direct
    4: 14.0,  # STADE 4 : Salve des popups virus existantes en force
    5: 14.0,  # STADE 5 : Effets ultra-ultra violents (chaos total, souris folle, GDI déchaîné)
    6: 5.0,   # STADE 6A : L'écran perd la vie (agonie, tremblement, effondrement CRT)
}
BLACKOUT_DURATION = 30.0  # STADE 6B : Blackout total, écran noir pendant exactement 30 secondes

# Constantes Win32 pour overlay transparent et cliquable
GWL_EXSTYLE        = -20
WS_EX_TRANSPARENT  = 0x00000020  # Clics traversants vers les fenêtres du dessous
WS_EX_LAYERED      = 0x00080000  # Transparence matérielle
WS_EX_TOPMOST      = 0x00000008  # Reste toujours au premier plan
VK_ESCAPE          = 0x1B        # Touche Échap
VK_LBUTTON         = 0x01        # Clic gauche souris

# Codes d'opérations graphiques GDI (Raster Operations)
SRCCOPY     = 0x00CC0020  # Copie brute
SRCINVERT   = 0x00660046  # XOR : Inversion psychédélique
SRCPAINT    = 0x00EE0086  # OR : Saturation néon violente
NOTSRCCOPY  = 0x00330008  # Négatif pur de la source
DSTINVERT   = 0x00550009  # Inversion de destination (strobe)
PATINVERT   = 0x005A0049  # XOR avec un pinceau de couleur

# Icônes Windows natives
IDI_ERROR       = 32513  # Croix rouge d'erreur
IDI_WARNING     = 32515  # Triangle attention

# Palette néon brutale (BGR pour GDI Win32)
NEON_BGR = [
    0x00FF00FF,  # Magenta éclatant
    0x00FFFF00,  # Cyan électrique
    0x0000FF00,  # Vert matrice / acide
    0x000000FF,  # Rouge sang
    0x0000FFFF,  # Jaune flash
    0x00FF0080,  # Violet intense
]

# Modèles de popups "Virus Infection" originaux + nouveaux pour la salve en force
VIRUS_TEMPLATES = [
    {
        "tag": "THREAT_01",
        "title": "[ ⚠ ALERTE CRITIQUE : CHEVAL DE TROIE DÉTECTÉ ]",
        "header_bg": "#b30000",
        "body_bg": "#150000",
        "border": "#ff1a1a",
        "text_color": "#ff6666",
        "lines": [
            "Menace : Trojan.Win64.MEMZ.Variant",
            "Cible  : C:\\Windows\\System32\\ntoskrnl.exe",
            "Action : CHIFFREMENT EN COURS...",
            "[██████████████░░░░] 78%",
            "Statut : INFECTION ACTIVE - SECTEURS COMPROMIS"
        ]
    },
    {
        "tag": "THREAT_02",
        "title": "[ ☠ CORRUPTION DU NOYAU SYSTÈME ☠ ]",
        "header_bg": "#006622",
        "body_bg": "#001406",
        "border": "#00ff55",
        "text_color": "#33ff77",
        "lines": [
            "Code Erreur : 0xC000021A (STATUS_SYSTEM_CRASH)",
            "Injection DLL : rootkit_payload_x64.sys",
            "Secteurs corrompus : 3,841 / 4,096",
            "> Écrasement de la table des partitions...",
            "ATTENTION : NE PAS ÉTEINDRE L'ORDINATEUR !"
        ]
    },
    {
        "tag": "THREAT_03",
        "title": "[ INTRUSION HACKER EN COURS - PORT 4444 ]",
        "header_bg": "#800080",
        "body_bg": "#120017",
        "border": "#e600e6",
        "text_color": "#ff80ff",
        "lines": [
            "> Connexion C2 établie : 194.26.29.???",
            "> Dump des mots de passe SAM... SUCCÈS",
            "> Pare-feu Windows : DÉSACTIVÉ",
            "> Envoi de 14,812 fichiers personnels...",
            "[ PANIQUER ]      [ ESSAYER DE FUIR ]"
        ]
    },
    {
        "tag": "THREAT_04",
        "title": "[ ☣ VOS FICHIERS SONT CHIFFRÉS ☣ ]",
        "header_bg": "#997a00",
        "body_bg": "#171200",
        "border": "#ffcc00",
        "text_color": "#ffe066",
        "lines": [
            "Algorithme : RSA-4096 / AES-256",
            "Temps restant avant suppression : 00:03:12",
            "Clé privée introuvable : SECTEUR DÉTRUIT",
            "Fichiers ciblés : Documents, Photos, Clés SSH",
            "Statut : RANSOMWARE EN PHASE TERMINALE"
        ]
    },
    {
        "tag": "THREAT_05",
        "title": "[ FATAL ERROR : MEMORY BUFFER OVERFLOW ]",
        "header_bg": "#7a0026",
        "body_bg": "#140007",
        "border": "#ff0055",
        "text_color": "#ff80aa",
        "lines": [
            "Stack pointer corrupted at 0x00FF8810",
            "Kernel panic dump : BAD_POOL_CALLER",
            "Impossible d'écrire dans la mémoire virtuelle.",
            "> Destruction du fichier de pagination...",
            "[ ARRÊTER LE VIRUS (ACCÈS REFUSÉ) ]"
        ]
    },
    {
        "tag": "THREAT_06",
        "title": "[ ⚡ GPU HARDWARE FAILURE : VRAM OVERLOAD ]",
        "header_bg": "#cc4400",
        "body_bg": "#1f0a00",
        "border": "#ff6600",
        "text_color": "#ffaa66",
        "lines": [
            "Contrôleur vidéo : TIMEOUT_DETECTION_RECOVERY",
            "Température VRAM : 108°C (SURCHAUFFE CRITIQUE)",
            "Désynchronisation du signal d'affichage HDMI/DP",
            "> Perte irréversible de la trame vidéo...",
            "[ ERREUR FATALE DU PILOTE GRAPHIQUE ]"
        ]
    },
    {
        "tag": "THREAT_07",
        "title": "[ 💳 EXFILTRATION DES DONNÉES BANCAIRES & CARTES ]",
        "header_bg": "#8b0000",
        "body_bg": "#180000",
        "border": "#ff3333",
        "text_color": "#ff9999",
        "lines": [
            "Capture Chrome/Edge AutoFill : 4 Cartes Visa/Mastercard",
            "Numéros CCV & Dates d'expiration copiés",
            "> Envoi immédiat vers serveur Tor distant (Moscou)",
            "> Autorisation des virements 3D-Secure outrepassée",
            "SOLDE BANCAIRE DÉVALISÉ EN COURS..."
        ]
    },
    {
        "tag": "THREAT_08",
        "title": "[ ☠ SYSTEM OVERRIDE : RANSOMWARE V4.8 ACTIVÉ ]",
        "header_bg": "#4b0082",
        "body_bg": "#0d001a",
        "border": "#a855f7",
        "text_color": "#d8b4fe",
        "lines": [
            "ID Victime : #X8812-FRANCE",
            "Rançon demandée : 1.75 BTC (~150 000 €)",
            "Temps restant avant effacement du BIOS : 00:01:59",
            "> Chiffrement des disques internes et externes...",
            "[ TOUTE TENTATIVE DE RÉCUPÉRATION ÉCHOUERA ]"
        ]
    }
]

GLITCH_TEXTS = [
    "0x00F8A21B: MEMORY_LEAK",
    "FATAL_EXCEPTION_IN_KERNEL32",
    "CANNOT RECOVER SECTOR 404",
    "CORRUPTION_RATE: 100%",
    "PAYLOAD_ACTIVE // OVERFLOW",
    "SYSTEM INTEGRITY COMPROMISED",
    "VRAM_PARITY_CHECK_FAILED",
    "01001000 01000101 01001100 01010000",
    "GPU CLOCK COLLAPSING: 15MHz",
    "UNAUTHORIZED BANK TRANSFER AUTHORIZED",
    "HARDWARE DEGRADATION DETECTED"
]

GLITCH_COLORS = ["#00ffff", "#ff00ff", "#39ff14", "#ff073a", "#ffff00", "#ffffff"]


# ======================================================================
# FAUSSE PAGE PAYPAL ULTRA-RÉALISTE & DÉBITS EN DIRECT
# ======================================================================
class FakePayPalWindow:
    """Rendu photoréaliste d'une fenêtre de navigateur affichant PayPal en train de se faire siphonner."""

    def __init__(self, canvas, screen_w, screen_h):
        self.canvas = canvas
        self.screen_w = screen_w
        self.screen_h = screen_h

        # Dimensions de la fausse fenêtre
        self.bw = min(890, int(screen_w * 0.78))
        self.bh = min(580, int(screen_h * 0.76))
        self.bx = (screen_w - self.bw) // 2
        self.by = (screen_h - self.bh) // 2

        self.items = []
        self.balance = -14850.00
        self.balance_text_id = None
        self.block_btn_id = None
        self.block_text_id = None
        self.alert_badge_id = None

        # Nouveaux débits terrifiants qui arriveront en direct
        self.pending_debits = [
            ("DarkNet Escrow Service #8812 (Fonds débloqués)", -3650.00, "CONFIRMÉ"),
            ("Virement Swift Immédiat Banque Dubaï", -6120.00, "CONFIRMÉ"),
            ("Kraken Crypto Instant Buy Monero (XMR)", -4990.00, "CONFIRMÉ"),
            ("Coinbase Pro Direct Debit (USDC)", -3850.00, "CONFIRMÉ"),
            ("Achat Rolex Direct UAE (Transaction Forcée)", -8900.00, "CONFIRMÉ"),
        ]

        self.next_debit_index = 0
        self.btn_bounds = None
        self.is_blocked_attempted = False

        self._draw_window()

    def _draw_window(self):
        bx, by, bw, bh = self.bx, self.by, self.bw, self.bh
        c = self.canvas

        # Ombre et corps principal de la fenêtre de navigateur
        shadow = c.create_rectangle(bx + 8, by + 8, bx + bw + 8, by + bh + 8, fill="#050505", outline="")
        self.items.append(shadow)

        bg = c.create_rectangle(bx, by, bx + bw, by + bh, fill="#f5f7fa", outline="#888888", width=2)
        self.items.append(bg)

        # -------------------------------------------------------------
        # 1. Barre d'onglets du navigateur (Style Chrome / Edge)
        # -------------------------------------------------------------
        chrome_bar = c.create_rectangle(bx, by, bx + bw, by + 40, fill="#1f2327", outline="")
        self.items.append(chrome_bar)

        # Onglet actif PayPal
        tab_rect = c.create_rectangle(bx + 12, by + 8, bx + 270, by + 40, fill="#ffffff", outline="")
        self.items.append(tab_rect)

        tab_title = c.create_text(
            bx + 26, by + 24,
            text="🔒 PayPal: Activité du compte",
            font=("Segoe UI", 9, "bold"),
            fill="#111827",
            anchor="w"
        )
        self.items.append(tab_title)

        tab_close = c.create_text(bx + 252, by + 24, text="✕", font=("Segoe UI", 9), fill="#6b7280")
        self.items.append(tab_close)

        # Boutons de contrôle Windows (— 🗖 ✕)
        ctrl_min = c.create_text(bx + bw - 60, by + 20, text="—", font=("Segoe UI", 10), fill="#d1d5db")
        ctrl_max = c.create_text(bx + bw - 38, by + 20, text="🗖", font=("Segoe UI", 9), fill="#d1d5db")
        ctrl_cls = c.create_text(bx + bw - 16, by + 20, text="✕", font=("Segoe UI", 10, "bold"), fill="#ef4444")
        self.items.extend([ctrl_min, ctrl_max, ctrl_cls])

        # -------------------------------------------------------------
        # 2. Barre d'adresse URL (Omnibox)
        # -------------------------------------------------------------
        url_bar_bg = c.create_rectangle(bx, by + 40, bx + bw, by + 76, fill="#2b3035", outline="")
        self.items.append(url_bar_bg)

        # Flèches de navigation
        nav_icons = c.create_text(bx + 22, by + 58, text="←  →  ⟳", font=("Segoe UI", 11, "bold"), fill="#9ca3af")
        self.items.append(nav_icons)

        # Champ URL blanc sécurisé
        url_input = c.create_rectangle(bx + 80, by + 45, bx + bw - 20, by + 70, fill="#ffffff", outline="#4b5563")
        self.items.append(url_input)

        url_text = c.create_text(
            bx + 92, by + 57,
            text="🔒 https://www.paypal.com/fr/myaccount/activity?status=critical_fraud_detected",
            font=("Segoe UI", 9),
            fill="#15803d",
            anchor="w"
        )
        self.items.append(url_text)

        # -------------------------------------------------------------
        # 3. En-tête PayPal officiel (Logo bleu + Navigation)
        # -------------------------------------------------------------
        pp_nav_bg = c.create_rectangle(bx, by + 76, bx + bw, by + 124, fill="#ffffff", outline="#e5e7eb")
        self.items.append(pp_nav_bg)

        # Logo PayPal
        logo_pay = c.create_text(bx + 24, by + 100, text="Pay", font=("Arial", 18, "bold italic"), fill="#003087", anchor="w")
        logo_pal = c.create_text(bx + 64, by + 100, text="Pal", font=("Arial", 18, "bold italic"), fill="#0079c1", anchor="w")
        self.items.extend([logo_pay, logo_pal])

        # Liens du menu
        menu_items = ["Accueil", "Activité", "Envoyer et demander", "Portefeuille", "Aide"]
        mx = bx + 140
        for i, item in enumerate(menu_items):
            is_active = (item == "Activité")
            txt = c.create_text(
                mx, by + 100,
                text=item,
                font=("Segoe UI", 9, "bold" if is_active else "normal"),
                fill="#0070ba" if is_active else "#4b5563",
                anchor="w"
            )
            self.items.append(txt)
            if is_active:
                under = c.create_line(mx, by + 116, mx + 48, by + 116, fill="#0070ba", width=3)
                self.items.append(under)
            mx += 115

        # Profil utilisateur et notification
        profile_bg = c.create_oval(bx + bw - 110, by + 86, bx + bw - 78, by + 114, fill="#003087", outline="")
        profile_txt = c.create_text(bx + bw - 94, by + 100, text="VP", font=("Segoe UI", 9, "bold"), fill="#ffffff")
        user_name = c.create_text(bx + bw - 70, by + 100, text="Victor P. ▾", font=("Segoe UI", 9, "bold"), fill="#1f2937", anchor="w")
        self.items.extend([profile_bg, profile_txt, user_name])

        # -------------------------------------------------------------
        # 4. Bannière d'alerte rouge flash (PANIQUE BANCAIRE)
        # -------------------------------------------------------------
        alert_bg = c.create_rectangle(bx + 16, by + 134, bx + bw - 16, by + 196, fill="#b91c1c", outline="#ef4444", width=2)
        self.items.append(alert_bg)

        alert_t1 = c.create_text(
            bx + 30, by + 152,
            text="🚨 ALERTE CRITIQUE : VIREMENTS FRAUDULEUX MASSIFS EN COURS",
            font=("Segoe UI", 11, "bold"),
            fill="#ffffff",
            anchor="w"
        )
        alert_t2 = c.create_text(
            bx + 30, by + 176,
            text="Intrusion pirate confirmée depuis l'IP 185.220.101.5 (Tor Exit Node - Fédération de Russie).",
            font=("Segoe UI", 9),
            fill="#fef08a",
            anchor="w"
        )
        self.items.extend([alert_t1, alert_t2])

        # -------------------------------------------------------------
        # 5. Carte du Solde Dévalisé (Gros montant rouge en négatif)
        # -------------------------------------------------------------
        card_bg = c.create_rectangle(bx + 16, by + 206, bx + bw - 16, by + 278, fill="#ffffff", outline="#e2e8f0", width=1)
        self.items.append(card_bg)

        solde_label = c.create_text(
            bx + 32, by + 226,
            text="Solde PayPal disponible (Compte Particulier lié FR76...) :",
            font=("Segoe UI", 9),
            fill="#64748b",
            anchor="w"
        )
        self.items.append(solde_label)

        self.balance_text_id = c.create_text(
            bx + 32, by + 254,
            text=f"{self.balance:,.2f} €".replace(",", " ").replace(".", ","),
            font=("Segoe UI", 20, "bold"),
            fill="#dc2626",
            anchor="w"
        )
        self.items.append(self.balance_text_id)

        self.alert_badge_id = c.create_text(
            bx + 260, by + 254,
            text="[ DÉCOUVERT IMMÉDIAT NON AUTORISÉ - PRÉLÈVEMENT BANCAIRE FORCÉ ]",
            font=("Segoe UI", 8, "bold"),
            fill="#b91c1c",
            anchor="w"
        )
        self.items.append(self.alert_badge_id)

        # -------------------------------------------------------------
        # 6. Liste des transactions frauduleuses déjà exécutées
        # -------------------------------------------------------------
        tx_header_bg = c.create_rectangle(bx + 16, by + 288, bx + bw - 16, by + 312, fill="#e2e8f0", outline="")
        self.items.append(tx_header_bg)

        h_date = c.create_text(bx + 32, by + 300, text="DATE / HEURE", font=("Segoe UI", 8, "bold"), fill="#475569", anchor="w")
        h_desc = c.create_text(bx + 150, by + 300, text="BÉNÉFICIAIRE / DESCRIPTION", font=("Segoe UI", 8, "bold"), fill="#475569", anchor="w")
        h_stat = c.create_text(bx + bw - 210, by + 300, text="STATUT", font=("Segoe UI", 8, "bold"), fill="#475569", anchor="w")
        h_mont = c.create_text(bx + bw - 32, by + 300, text="MONTANT", font=("Segoe UI", 8, "bold"), fill="#475569", anchor="e")
        self.items.extend([h_date, h_desc, h_stat, h_mont])

        # Transactions initiales
        initial_txs = [
            ("Aujourd'hui 16:31:02", "Virement Instantané SEPA -> RU8930400... (Moscou)", "DÉBITÉ", "-5 400,00 €"),
            ("Aujourd'hui 16:30:45", "CryptoVoucher Ltd - Recharge Bitcoin BTC", "DÉBITÉ", "-4 250,00 €"),
            ("Aujourd'hui 16:30:18", "Binance P2P Escrow Global Trading (Instant)", "DÉBITÉ", "-3 800,00 €"),
            ("Aujourd'hui 16:29:50", "Apple Store Direct - 10x Cartes Cadeaux 250€", "DÉBITÉ", "-2 500,00 €"),
            ("Aujourd'hui 16:29:12", "Steam Wallet Funds Direct Bulk Checkout", "DÉBITÉ", "-1 900,00 €"),
        ]

        row_y = by + 332
        for date_str, desc_str, stat_str, mont_str in initial_txs:
            r_bg = c.create_rectangle(bx + 16, row_y - 12, bx + bw - 16, row_y + 16, fill="#ffffff", outline="#f1f5f9")
            t_d = c.create_text(bx + 32, row_y + 2, text=date_str, font=("Segoe UI", 8), fill="#64748b", anchor="w")
            t_c = c.create_text(bx + 150, row_y + 2, text=desc_str, font=("Segoe UI", 8, "bold"), fill="#1e293b", anchor="w")
            t_s = c.create_text(bx + bw - 210, row_y + 2, text=stat_str, font=("Segoe UI", 8, "bold"), fill="#dc2626", anchor="w")
            t_m = c.create_text(bx + bw - 32, row_y + 2, text=mont_str, font=("Segoe UI", 9, "bold"), fill="#dc2626", anchor="e")
            self.items.extend([r_bg, t_d, t_c, t_s, t_m])
            row_y += 32

        # -------------------------------------------------------------
        # 7. Bouton de panique : "BLOQUER LE COMPTE"
        # -------------------------------------------------------------
        btn_y1 = by + bh - 60
        btn_y2 = by + bh - 16
        self.btn_bounds = (bx + 24, btn_y1, bx + 420, btn_y2)

        self.block_btn_id = c.create_rectangle(
            bx + 24, btn_y1, bx + 420, btn_y2,
            fill="#dc2626", outline="#991b1b", width=2
        )
        self.block_text_id = c.create_text(
            bx + 222, (btn_y1 + btn_y2) // 2,
            text="🛑 BLOQUER LE COMPTE ET ANNULER LES TRANSACTIONS",
            font=("Segoe UI", 9, "bold"),
            fill="#ffffff"
        )
        self.items.extend([self.block_btn_id, self.block_text_id])

        # Bouton secondaire support
        btn_sec = c.create_rectangle(bx + 435, btn_y1, bx + bw - 24, btn_y2, fill="#e2e8f0", outline="#cbd5e1")
        btn_sec_txt = c.create_text(
            (bx + 435 + bx + bw - 24) // 2, (btn_y1 + btn_y2) // 2,
            text="📞 Cellule de Crise Anti-Fraude (Ligne Surchargée)",
            font=("Segoe UI", 8),
            fill="#475569"
        )
        self.items.extend([btn_sec, btn_sec_txt])

    def inject_live_debit(self):
        """Ajoute un nouveau débit colossal en direct sous les yeux de la victime !"""
        if self.next_debit_index >= len(self.pending_debits):
            return

        desc, amount, status = self.pending_debits[self.next_debit_index]
        self.next_debit_index += 1
        self.balance += amount

        # Mise à jour immédiate du solde en négatif terrifiant
        self.canvas.itemconfig(
            self.balance_text_id,
            text=f"{self.balance:,.2f} €".replace(",", " ").replace(".", ",")
        )

        # Flasher le badge en rouge clignotant
        self.canvas.itemconfig(
            self.alert_badge_id,
            text=f"⚠ DÉBIT IMMÉDIAT ACCEPTÉ : {desc[:40]}... ({amount:,.2f} €)"
        )

        # Son d'alerte Windows asynchrone pour faire sursauter
        try:
            winsound.MessageBeep(winsound.MB_ICONHAND)
        except Exception:
            pass

    def check_user_click(self, mouse_x, mouse_y):
        """Si la victime essaie désespérément de cliquer sur Bloquer, on refuse violemment l'accès."""
        if not self.btn_bounds:
            return

        x1, y1, x2, y2 = self.btn_bounds
        if x1 <= mouse_x <= x2 and y1 <= mouse_y <= y2:
            self.is_blocked_attempted = True
            # Passe le bouton en noir/jaune d'erreur fatale
            self.canvas.itemconfig(self.block_btn_id, fill="#000000", outline="#ffff00")
            self.canvas.itemconfig(
                self.block_text_id,
                text="✖ ACCÈS REFUSÉ : COMPTE SOUS SÉQUESTRE PIRATE",
                fill="#ffff00"
            )
            try:
                winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)
            except Exception:
                pass

    def jitter(self, dx, dy):
        """Fait trembler la fenêtre PayPal lors des phases de chaos violent."""
        for item in self.items:
            self.canvas.move(item, dx, dy)
        if self.btn_bounds:
            x1, y1, x2, y2 = self.btn_bounds
            self.btn_bounds = (x1 + dx, y1 + dy, x2 + dx, y2 + dy)


# ======================================================================
# SIMULATEUR DE VIRUS EN 6 STADES AVEC MONTÉE DE TENSION
# ======================================================================
class BrutalBrokenScreenGlitch:
    def __init__(self):
        self.start_time = time.time()
        self.stage = 1
        self.stage_start_time = self.start_time

        # Contexte GDI de l'écran principal
        self.hdc_screen = user32.GetDC(0)
        self.icon_error = user32.LoadIconW(0, IDI_ERROR)
        self.icon_warn  = user32.LoadIconW(0, IDI_WARNING)

        # Fenêtre Tkinter plein écran transparente
        self.root = tk.Tk()
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.attributes("-transparentcolor", "black")
        self.root.config(bg="black")

        self.w = self.root.winfo_screenwidth()
        self.h = self.root.winfo_screenheight()
        self.root.geometry(f"{self.w}x{self.h}+0+0")

        self.canvas = tk.Canvas(self.root, bg="black", highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)

        # Rend la fenêtre cliquable à travers (click-through) pour piéger la cible
        hwnd = user32.GetParent(self.root.winfo_id())
        current_style = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
        user32.SetWindowLongW(hwnd, GWL_EXSTYLE, current_style | WS_EX_LAYERED | WS_EX_TRANSPARENT)

        # Gestionnaires d'éléments
        self.crack_items = []
        self.boxes = []
        self.glitch_bars = []
        self.text_noises = []
        self.dead_pixel_lines = []

        # Système de popups
        self.popup_index = 0
        self.next_popup_time = 0

        # Système PayPal
        self.paypal_window = None
        self.next_paypal_debit_time = 0

        # Touche souris pour détecter les clics sur PayPal
        self.prev_mouse_lbutton = 0

        # Génération des fissures d'écran cassé et pixels morts (si activé)
        if ENABLE_SCREEN_CRACKS:
            self.create_broken_screen_effect()

        # Démarrage direct par la fausse page PayPal (STADE 3)
        self.paypal_window = FakePayPalWindow(self.canvas, self.w, self.h)
        self.next_paypal_debit_time = self.start_time + 2.5
        if self.crack_items:
            for item in self.crack_items:
                self.canvas.tag_raise(item)

    # -------------------------------------------------------------
    # EFFET ÉCRAN CASSÉ (Fissures réelles, fuite LCD, colonnes mortes)
    # -------------------------------------------------------------
    def create_broken_screen_effect(self):
        """Génère l'impact physique d'un écran cassé avec fissures et fuite de cristaux liquides."""
        impacts = [
            (int(self.w * 0.38), int(self.h * 0.42)),
            (int(self.w * 0.72), int(self.h * 0.65))
        ]

        for cx, cy in impacts:
            # Tache d'encre LCD (cristaux liquides noirs et violets qui fuient)
            for _ in range(7):
                rx = random.randint(25, 70)
                ry = random.randint(20, 60)
                ox = cx + random.randint(-35, 35)
                oy = cy + random.randint(-35, 35)
                oval = self.canvas.create_oval(
                    ox - rx, oy - ry, ox + rx, oy + ry,
                    fill="#0a0012", outline="#26003b", width=2
                )
                self.crack_items.append(oval)

            # Lignes de fracture en toile d'araignée (fissures blanches et reflets cyan/magenta)
            num_cracks = random.randint(9, 14)
            for i in range(num_cracks):
                angle = (2 * math.pi / num_cracks) * i + random.uniform(-0.25, 0.25)
                length = random.randint(180, 550)
                curr_x, curr_y = cx, cy

                step = 28
                for _ in range(length // step):
                    next_x = curr_x + math.cos(angle) * step + random.randint(-12, 12)
                    next_y = curr_y + math.sin(angle) * step + random.randint(-12, 12)

                    # Ligne principale blanche éclatante
                    l1 = self.canvas.create_line(curr_x, curr_y, next_x, next_y, fill="#ffffff", width=2)
                    self.crack_items.append(l1)

                    # Frange chromatique (effet verre brisé)
                    l2 = self.canvas.create_line(curr_x + 1, curr_y + 1, next_x + 1, next_y + 1, fill="#00f0ff", width=1)
                    self.crack_items.append(l2)

                    # Ramification secondaire
                    if random.random() < 0.35:
                        sub_angle = angle + random.choice([-0.8, 0.8])
                        sub_x = next_x + math.cos(sub_angle) * 35
                        sub_y = next_y + math.sin(sub_angle) * 35
                        l3 = self.canvas.create_line(next_x, next_y, sub_x, sub_y, fill="#d8d8d8", width=1)
                        self.crack_items.append(l3)

                    curr_x, curr_y = next_x, next_y

        # Lignes verticales permanentes de pixels morts (défaut matériel d'écran cassé)
        dead_colors = ["#ff007f", "#00ff41", "#00ffff", "#ffff00", "#ffffff", "#ff1a1a"]
        for _ in range(12):
            lx = random.randint(20, self.w - 20)
            col = random.choice(dead_colors)
            line_id = self.canvas.create_line(lx, 0, lx, self.h, fill=col, width=random.choice([1, 2, 3]))
            self.dead_pixel_lines.append(line_id)
            self.crack_items.append(line_id)

    # -------------------------------------------------------------
    # EFFETS GDI EXISTANTS (Tearing, Roll, Melt, Neons, Strobe, Icons)
    # -------------------------------------------------------------
    def apply_violent_gdi(self, intensity=1.0):
        """Exécute des corruptions graphiques GDI adaptées au stade actuel."""
        effect = random.choice([
            "massive_tearing",
            "vertical_roll",
            "hard_melt",
            "mirror_smash",
            "neon_blast",
            "strobe_flash",
            "icon_cluster"
        ])

        if effect == "massive_tearing":
            # Déchirure massive : glissement brutal d'un tiers de l'écran avec inversion
            y = random.randint(0, max(1, self.h - 180))
            sh = random.randint(40, int(220 * intensity))
            offset_x = int(random.choice([-350, -200, 200, 350]) * intensity)
            rop = random.choice([SRCINVERT, NOTSRCCOPY, SRCPAINT])
            gdi32.BitBlt(self.hdc_screen, offset_x, y, self.w, sh, self.hdc_screen, 0, y, rop)

        elif effect == "vertical_roll":
            # Défilement V-Sync cassé (l'écran glisse vers le bas brutalement)
            roll_h = random.randint(40, int(150 * intensity))
            gdi32.BitBlt(self.hdc_screen, 0, roll_h, self.w, self.h - roll_h, self.hdc_screen, 0, 0, SRCCOPY)

        elif effect == "hard_melt":
            # Fonte violente en grappes (colonnes qui coulent)
            columns = int(8 * intensity)
            for _ in range(max(2, columns)):
                x = random.randint(0, max(1, self.w - 70))
                cw = random.randint(15, 65)
                drop = random.randint(12, int(50 * intensity))
                gdi32.BitBlt(self.hdc_screen, x, drop, cw, self.h - 80, self.hdc_screen, x, 0, SRCCOPY)

        elif effect == "mirror_smash":
            # Blocs miroirs inversés horizontalement
            x = random.randint(0, max(1, self.w - 350))
            y = random.randint(0, max(1, self.h - 180))
            sw = random.randint(150, 400)
            sh = random.randint(50, 180)
            gdi32.StretchBlt(self.hdc_screen, x + sw, y, -sw, sh, self.hdc_screen, x, y, sw, sh, SRCCOPY)

        elif effect == "neon_blast":
            # Pâtés de couleurs néon fusionnés par XOR
            color = random.choice(NEON_BGR)
            brush = gdi32.CreateSolidBrush(color)
            old_brush = gdi32.SelectObject(self.hdc_screen, brush)
            bx = random.randint(0, max(1, self.w - 200))
            by = random.randint(0, max(1, self.h - 150))
            bw = random.randint(80, int(450 * intensity))
            bh = random.randint(40, int(250 * intensity))
            gdi32.PatBlt(self.hdc_screen, bx, by, bw, bh, PATINVERT)
            gdi32.SelectObject(self.hdc_screen, old_brush)
            gdi32.DeleteObject(brush)

        elif effect == "strobe_flash":
            # Flash stroboscopique ultra-rapide négatif
            threshold = 0.08 * intensity
            if random.random() < threshold:
                gdi32.BitBlt(self.hdc_screen, 0, 0, self.w, self.h, self.hdc_screen, 0, 0, DSTINVERT)

        elif effect == "icon_cluster":
            # Rafale d'icônes d'erreurs groupées
            base_x = random.randint(50, max(50, self.w - 150))
            base_y = random.randint(50, max(50, self.h - 150))
            for _ in range(random.randint(2, int(6 * intensity))):
                ix = base_x + random.randint(-50, 50)
                iy = base_y + random.randint(-50, 50)
                icon = random.choice([self.icon_error, self.icon_warn])
                user32.DrawIcon(self.hdc_screen, ix, iy, icon)

    # -------------------------------------------------------------
    # POPUPS VIRUS (Déploiement progressif ou salve en force)
    # -------------------------------------------------------------
    def spawn_next_virus_popup(self):
        """Fait apparaître une boîte popup d'infection."""
        template = VIRUS_TEMPLATES[self.popup_index % len(VIRUS_TEMPLATES)]
        self.popup_index += 1

        bw = random.randint(360, 440)
        bh = 175
        bx = random.randint(30, max(30, self.w - bw - 40))
        by = random.randint(30, max(30, self.h - bh - 60))

        items = []

        # Corps de la fenêtre
        body = self.canvas.create_rectangle(
            bx, by, bx + bw, by + bh,
            fill=template["body_bg"],
            outline=template["border"],
            width=2
        )
        items.append(body)

        # Barre de titre
        header = self.canvas.create_rectangle(
            bx, by, bx + bw, by + 28,
            fill=template["header_bg"],
            outline=template["border"],
            width=2
        )
        items.append(header)

        # Titre
        title_text = self.canvas.create_text(
            bx + 8, by + 14,
            text=f"{template['title']} #{self.popup_index}",
            fill="#ffffff",
            anchor="w",
            font=("Consolas", 9, "bold")
        )
        items.append(title_text)

        # Lignes d'informations
        line_y = by + 46
        for line in template["lines"]:
            t = self.canvas.create_text(
                bx + 12, line_y,
                text=line,
                fill=template["text_color"],
                anchor="w",
                font=("Consolas", 9, "bold" if "[" in line or "!" in line or ">" in line else "normal")
            )
            items.append(t)
            line_y += 24

        self.boxes.append({"items": items, "x": bx, "y": by})

        # Onde de choc visuelle + sonore
        gdi32.BitBlt(self.hdc_screen, 0, 0, self.w, self.h, self.hdc_screen, 0, 0, DSTINVERT)
        try:
            winsound.MessageBeep(winsound.MB_ICONHAND)
        except Exception:
            pass

    # -------------------------------------------------------------
    # ARTEFACTS & SCANLINES COMPLÉMENTAIRES
    # -------------------------------------------------------------
    def spawn_scanlines_and_noise(self, count_mult=1.0):
        """Bandes parasites et tearing néon haute fréquence."""
        bars_count = int(random.randint(3, 8) * count_mult)
        for _ in range(bars_count):
            gy = random.randint(0, self.h - 10)
            gw = random.randint(150, self.w)
            gx = random.randint(0, max(0, self.w - gw))
            gh = random.randint(2, 14)
            color = random.choice(GLITCH_COLORS)
            bar = self.canvas.create_rectangle(gx, gy, gx + gw, gy + gh, fill=color, outline="")
            self.glitch_bars.append((bar, time.time()))

        # Textes mémoire parasites
        max_texts = int(16 * count_mult)
        if len(self.text_noises) < max_texts and random.random() < 0.5:
            tx = random.randint(40, max(40, self.w - 360))
            ty = random.randint(40, max(40, self.h - 40))
            tid = self.canvas.create_text(
                tx, ty,
                text=random.choice(GLITCH_TEXTS),
                fill=random.choice(GLITCH_COLORS),
                font=("Consolas", 11, "bold")
            )
            self.text_noises.append((tid, time.time()))

    def clean_temporary_glitches(self):
        """Nettoie les micro-glitches pour un clignotement permanent."""
        now = time.time()
        surviving_bars = []
        for bar, created_at in self.glitch_bars:
            if now - created_at > random.uniform(0.03, 0.09):
                self.canvas.delete(bar)
            else:
                surviving_bars.append((bar, created_at))
        self.glitch_bars = surviving_bars

        surviving_texts = []
        for tid, created_at in self.text_noises:
            if now - created_at > random.uniform(0.2, 0.6):
                self.canvas.delete(tid)
            else:
                surviving_texts.append((tid, created_at))
        self.text_noises = surviving_texts

    def jitter_boxes(self, max_offset=3):
        """Fait vibrer les boîtes d'infection accumulées."""
        for box in self.boxes:
            dx = random.randint(-max_offset, max_offset)
            dy = random.randint(-max_offset, max_offset)
            for item in box["items"]:
                self.canvas.move(item, dx, dy)

    # -------------------------------------------------------------
    # SOURIS FOLLE (STADE 5)
    # -------------------------------------------------------------
    def jitter_mouse_cursor(self, intensity=35):
        """Fait convulser la souris pour simuler la prise de contrôle absolue."""
        try:
            pt = wintypes.POINT()
            user32.GetCursorPos(ctypes.byref(pt))
            dx = random.randint(-intensity, intensity)
            dy = random.randint(-intensity, intensity)
            user32.SetCursorPos(pt.x + dx, pt.y + dy)
        except Exception:
            pass

    # -------------------------------------------------------------
    # AGONIE DE L'ÉCRAN & EXTINCTION CRT (STADE 6A)
    # -------------------------------------------------------------
    def execute_screen_death_sequence(self):
        """Simule l'agonie physique de l'écran, perte d'alimentation et effondrement CRT."""
        print("\n" + "=" * 70)
        print(" [!] STADE 6A : L'ÉCRAN PERD LA VIE... EFFONDREMENT DU SIGNAL...")
        print("=" * 70)

        # Son de décharge et de chute de tension dans un thread
        def play_death_drone():
            try:
                for freq in [800, 650, 450, 300, 180, 90]:
                    winsound.Beep(freq, 120)
            except Exception:
                pass

        threading.Thread(target=play_death_drone, daemon=True).start()

        # Phase 1 : L'écran tremble et commence à perdre ses couleurs
        death_start = time.time()
        while time.time() - death_start < 2.0:
            if user32.GetAsyncKeyState(VK_ESCAPE) & 0x8000:
                return False

            # Tremblement vertical et lignes de balayage défaillantes
            gdi32.BitBlt(self.hdc_screen, 0, random.randint(-6, 6), self.w, self.h, self.hdc_screen, 0, 0, SRCCOPY)
            if random.random() < 0.3:
                gdi32.BitBlt(self.hdc_screen, 0, 0, self.w, self.h, self.hdc_screen, 0, 0, NOTSRCCOPY)

            self.root.update()
            time.sleep(0.04)

        # Phase 2 : Transition vers le noir réel (on désactive transparentcolor)
        self.root.attributes("-transparentcolor", "")
        self.canvas.delete("all")
        self.root.update()

        center_x = self.w // 2
        center_y = self.h // 2

        # Ligne de faisceau cathodique blanche et cyan
        beam = self.canvas.create_line(0, center_y, self.w, center_y, fill="#00ffff", width=4)
        beam_glow = self.canvas.create_line(0, center_y, self.w, center_y, fill="#ffffff", width=2)
        self.root.update()
        time.sleep(0.3)

        # Effondrement horizontal de la ligne vers un point central
        steps = 25
        for s in range(steps):
            if user32.GetAsyncKeyState(VK_ESCAPE) & 0x8000:
                return False
            progress = s / float(steps)
            x1 = int(center_x * progress)
            x2 = int(self.w - center_x * progress)
            self.canvas.coords(beam, x1, center_y, x2, center_y)
            self.canvas.coords(beam_glow, x1, center_y, x2, center_y)
            self.root.update()
            time.sleep(0.02)

        self.canvas.delete(beam)
        self.canvas.delete(beam_glow)

        # Le point phosphorique agonise au centre de l'écran
        dot = self.canvas.create_oval(center_x - 4, center_y - 4, center_x + 4, center_y + 4, fill="#ffffff", outline="#00ffff")
        self.root.update()
        time.sleep(0.4)

        # Clignotement faible du point mourant
        self.canvas.itemconfig(dot, fill="#ffaa00")
        self.root.update()
        time.sleep(0.2)

        self.canvas.itemconfig(dot, fill="#ff2200")
        self.root.update()
        time.sleep(0.2)

        self.canvas.delete(dot)
        self.root.update()
        return True

    # -------------------------------------------------------------
    # BLACKOUT TOTAL DE 30 SECONDES (STADE 6B)
    # -------------------------------------------------------------
    def execute_blackout(self, duration=BLACKOUT_DURATION):
        """Écran 100% noir pendant 30 secondes. Silence de mort. Curseur masqué."""
        print("\n" + "=" * 70)
        print(f" [!] STADE 6B : BLACKOUT COMPLET PENDANT {int(duration)} SECONDES !")
        print(" [!] Écran noir absolu, curseur masqué, silence total...")
        print(" [!] Appuie sur [ÉCHAP] à tout moment pour restaurer immédiatement.")
        print("=" * 70)

        # Masque le curseur de souris pour donner l'impression d'un PC totalement éteint/mort
        user32.ShowCursor(False)
        self.root.config(cursor="none")

        blackout_start = time.time()
        last_logged = int(duration)

        try:
            while time.time() - blackout_start < duration:
                # Échap toujours actif pour annuler
                if user32.GetAsyncKeyState(VK_ESCAPE) & 0x8000:
                    print("\n[!] Réveil anticipé demandé par l'utilisateur (Échap) !")
                    break

                elapsed = time.time() - blackout_start
                remaining = int(duration - elapsed)
                if remaining < last_logged and remaining % 5 == 0 and remaining > 0:
                    print(f" -> Blackout en cours... Temps restant : {remaining}s")
                    last_logged = remaining

                # Maintient la boucle d'événements active pour éviter l'alerte 'Ne répond pas' de Windows
                self.root.update()
                time.sleep(0.05)

        finally:
            user32.ShowCursor(True)
            self.root.config(cursor="")

    # -------------------------------------------------------------
    # GESTION DES CLICS UTILISATEUR SUR PAYPAL
    # -------------------------------------------------------------
    def handle_user_clicks(self):
        """Détecte les clics gauche de la victime pour réagir sur PayPal."""
        if not self.paypal_window:
            return

        current_mouse = user32.GetAsyncKeyState(VK_LBUTTON) & 0x8000
        if current_mouse and not self.prev_mouse_lbutton:
            # Nouveau clic détecté !
            pt = wintypes.POINT()
            user32.GetCursorPos(ctypes.byref(pt))
            self.paypal_window.check_user_click(pt.x, pt.y)

        self.prev_mouse_lbutton = current_mouse

    # -------------------------------------------------------------
    # BOUCLE PRINCIPALE AVEC PROGRESSION DRAMATIQUE
    # -------------------------------------------------------------
    def run(self):
        print("=" * 70)
        print(" [!] SIMULATION VIRUS HARDCORE À TENSION PROGRESSIVE")
        print(" [!] DÉMARRAGE DIRECT AU STADE 3 : Fausse Page PayPal")
        print(" [!] PROGRESSION : Fausse Page PayPal -> Popups -> Ultra-Violent -> Blackout")
        print(" [!] Appuie sur [ÉCHAP] à tout moment pour TOUT restaurer proprement.")
        print("=" * 70)

        # Calcul des paliers de temps pour chaque stade (démarrage direct Stade 3)
        s3_end = STAGE_DURATIONS[3]
        s4_end = s3_end + STAGE_DURATIONS[4]
        s5_end = s4_end + STAGE_DURATIONS[5]

        last_stage_announced = 0
        last_gdi_time = time.time()

        try:
            while True:
                # 1. Échappement d'urgence
                if user32.GetAsyncKeyState(VK_ESCAPE) & 0x8000:
                    print("\n[!] Arrêt d'urgence demandé (Échap) !")
                    break

                now = time.time()
                elapsed = now - self.start_time

                # ---------------------------------------------------------
                # DÉTERMINATION DU STADE ACTUEL
                # ---------------------------------------------------------
                if elapsed < s3_end:
                    current_stage = 3
                elif elapsed < s4_end:
                    current_stage = 4
                elif elapsed < s5_end:
                    current_stage = 5
                else:
                    current_stage = 6

                # Annonce du changement de stade dans la console
                if current_stage != last_stage_announced:
                    last_stage_announced = current_stage
                    if current_stage == 3:
                        print("\n>>> [STADE 3] DÉMARRAGE DIRECT : DÉPLOIEMENT DE LA FAUSSE PAGE PAYPAL - DÉBITS EN DIRECT !")
                        if not self.paypal_window:
                            self.paypal_window = FakePayPalWindow(self.canvas, self.w, self.h)
                            self.next_paypal_debit_time = now + 2.5
                            if self.crack_items:
                                for item in self.crack_items:
                                    self.canvas.tag_raise(item)
                    elif current_stage == 4:
                        print("\n>>> [STADE 4] LES POPUPS DE VIRUS REVIENNENT EN FORCE !")
                        self.next_popup_time = now + 0.1
                    elif current_stage == 5:
                        print("\n>>> [STADE 5] APOCALYPSE TOTALE : EFFETS ULTRA-ULTRA VIOLENTS & SOURIS FOLLE !")
                    elif current_stage == 6:
                        # Fin de la phase active, passage à l'agonie puis blackout
                        break

                # ---------------------------------------------------------
                # EXÉCUTION DU STADE 3 : Fausse Page PayPal
                # ---------------------------------------------------------
                if current_stage == 3:
                    self.spawn_scanlines_and_noise(count_mult=0.7)
                    self.handle_user_clicks()

                    # Nouveaux débits injectés en direct
                    if now >= self.next_paypal_debit_time:
                        self.paypal_window.inject_live_debit()
                        self.next_paypal_debit_time = now + random.uniform(2.2, 3.0)

                    # GDI modéré pour continuer la dégradation en fond
                    if now - last_gdi_time > 0.4:
                        self.apply_violent_gdi(intensity=0.7)
                        last_gdi_time = now

                # ---------------------------------------------------------
                # EXÉCUTION DU STADE 4 : Popups en force
                # ---------------------------------------------------------
                elif current_stage == 4:
                    self.spawn_scanlines_and_noise(count_mult=1.4)
                    self.handle_user_clicks()

                    # Popups en rafale rapide
                    if now >= self.next_popup_time:
                        self.spawn_next_virus_popup()
                        self.next_popup_time = now + random.uniform(0.35, 0.65)

                    # Popups et PayPal qui tremblent
                    self.jitter_boxes(max_offset=4)
                    if self.paypal_window:
                        self.paypal_window.jitter(random.randint(-3, 3), random.randint(-2, 2))

                    # GDI soutenu
                    for _ in range(2):
                        self.apply_violent_gdi(intensity=1.1)

                # ---------------------------------------------------------
                # EXÉCUTION DU STADE 5 : Ultra ultra violent & Souris folle
                # ---------------------------------------------------------
                elif current_stage == 5:
                    self.spawn_scanlines_and_noise(count_mult=2.2)

                    # Salve continue de popups
                    if now >= self.next_popup_time:
                        self.spawn_next_virus_popup()
                        self.next_popup_time = now + random.uniform(0.25, 0.45)

                    # GDI frénétique (5 à 8 opérations par tick !)
                    for _ in range(random.randint(5, 8)):
                        self.apply_violent_gdi(intensity=1.8)

                    # Vibrations intenses
                    self.jitter_boxes(max_offset=8)
                    if self.paypal_window:
                        self.paypal_window.jitter(random.randint(-7, 7), random.randint(-5, 5))

                    # Prise de contrôle folle de la souris
                    self.jitter_mouse_cursor(intensity=45)

                    # Bips d'alerte rapides
                    if random.random() < 0.35:
                        threading.Thread(
                            target=lambda: winsound.Beep(random.randint(700, 1600), 70),
                            daemon=True
                        ).start()

                # Nettoyage et rafraîchissement
                self.clean_temporary_glitches()
                self.root.update()
                time.sleep(0.015)

            # ---------------------------------------------------------
            # STADE 6 : Agonie de l'écran puis Blackout de 30 secondes
            # ---------------------------------------------------------
            if user32.GetAsyncKeyState(VK_ESCAPE) & 0x8000 == 0:
                proceeded = self.execute_screen_death_sequence()
                if proceeded:
                    self.execute_blackout(duration=BLACKOUT_DURATION)

        finally:
            # ---------------------------------------------------------
            # RESTAURATION SYSTÉMATIQUE ET PROPRE DE WINDOWS
            # ---------------------------------------------------------
            user32.ShowCursor(True)
            user32.ReleaseDC(0, self.hdc_screen)
            try:
                self.root.destroy()
            except Exception:
                pass

            # Force Windows à redessiner entièrement le bureau
            user32.InvalidateRect(0, 0, True)
            user32.RedrawWindow(0, 0, 0, 0x0185)

            print("=" * 70)
            print(" [✔] PRANK TERMINÉ ! TON ORDINATEUR EST EN PARFAITE SANTÉ ! :)")
            print(" [✔] Aucun débit PayPal n'a été effectué, ton écran est 100% intact.")
            print(" [✔] Affichage Windows, souris et fenêtres entièrement restaurés.")
            print("=" * 70)


if __name__ == "__main__":
    app = BrutalBrokenScreenGlitch()
    app.run()
