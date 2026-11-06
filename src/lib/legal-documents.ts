import type { Locale } from "@/i18n/locales";
import { AUDIT_RETENTION_DAYS, EMAIL_LOG_RETENTION_DAYS, ORPHAN_UPLOAD_DAYS } from "@/lib/legal";
import { PAY_HOLD_MINUTES, PAYMENT_HOLD_MINUTES, PLATFORM_FEE_BPS, AUTO_COMPLETE_DAYS_AFTER_DELIVERY_BUFFER, QRIS_MAX_IDR, REFUND_BY_HAND_DAYS } from "@/lib/constants";
import { formatMoney } from "@/lib/format";

// The Privacy Policy and Terms, in both languages. Each statement describes
// what the app actually does; when behaviour changes (a new cookie, a new
// provider, a different retention period), update the text and LEGAL_VERSION.
//
// Text may contain [label](/path) links and {operator} {address} {email}
// {court} placeholders, filled in from LEGAL_DETAILS when rendered.

export type LegalBlock = string | { list: string[] };
export type LegalSection = { id: string; heading: string; blocks: LegalBlock[] };
export type LegalDocument = { title: string; intro: string; sections: LegalSection[] };

const FEE = `${PLATFORM_FEE_BPS / 100}%`;
const AUDIT_YEARS = Math.round(AUDIT_RETENTION_DAYS / 365);

const privacy: Record<Locale, LegalDocument> = {
  id: {
    title: "Kebijakan Privasi",
    intro:
      "Kebijakan ini menjelaskan data pribadi apa yang dikumpulkan ReGear, untuk apa, siapa yang bisa melihatnya, berapa lama disimpan, dan hak Anda. Kebijakan ini disusun berdasarkan Undang-Undang No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP).",
    sections: [
      {
        id: "who",
        heading: "1. Siapa kami",
        blocks: [
          "ReGear adalah marketplace elektronik bekas yang dikelola oleh {operator}, beralamat di {address} (\"ReGear\", \"kami\"). Kami adalah pengendali data pribadi untuk data yang dijelaskan di sini.",
          "Pertanyaan atau permintaan tentang data Anda dapat dikirim ke {email}.",
        ],
      },
      {
        id: "collect",
        heading: "2. Data yang kami kumpulkan",
        blocks: [
          "Kami hanya mengumpulkan data yang diperlukan untuk menjalankan marketplace:",
          {
            list: [
              "Akun: nama, alamat email, dan kata sandi. Kata sandi disimpan sebagai hash satu arah (scrypt), sehingga kami sendiri tidak bisa membacanya. Kami juga mencatat versi Syarat dan Kebijakan ini yang Anda setujui dan kapan.",
              "Masuk dengan Google: jika Anda memilihnya, Google memberi kami ID akun Google, alamat email, dan nama Anda (izin \"openid\", \"email\", \"profile\"). Kami tidak menerima kontak, file, atau data Google lainnya.",
              "Pembelian: alamat yang Anda simpan (nama penerima, nomor telepon, alamat, catatan untuk kurir, dan pin lokasi di peta jika Anda menambahkannya), pesanan, pengembalian, sengketa, dan ulasan yang Anda tulis.",
              "Penjualan: nama toko, deskripsi, dan lokasi toko; iklan, laporan kondisi, dan foto barang. Saat foto diunggah, kami membuat ulang gambarnya sehingga metadata seperti lokasi GPS dan nomor seri kamera terhapus.",
              "Verifikasi penjual (opsional): nama sesuai identitas, nomor telepon, alamat, jenis dokumen, empat karakter terakhir nomor dokumen (nomor lengkapnya tidak disimpan), dan foto dokumen identitas. Data ini hanya dikumpulkan dengan persetujuan eksplisit Anda saat mengajukan verifikasi.",
              "Pesan: pesan dan bukti yang Anda tulis dalam sengketa, catatan pengembalian, dan alasan pembatalan.",
              `Email dari kami: kami mengirim email terkait akun dan pesanan Anda, yaitu konfirmasi alamat email, tautan atur ulang kata sandi, perkembangan pesanan, pengembalian dan sengketa, serta hasil verifikasi penjual. Kami mencatat email yang dikirim (penerima, jenis, dan waktunya) selama ${EMAIL_LOG_RETENTION_DAYS} hari.`,
              "Data teknis dan keamanan: alamat IP dan jenis peramban untuk sesi login; catatan keamanan seperti masuk, keluar, perubahan kata sandi, keputusan verifikasi, dan setiap kali dokumen identitas dilihat petugas; serta penghitung percobaan (misalnya percobaan masuk per IP atau email) untuk mencegah penyalahgunaan.",
            ],
          },
          "Pembayaran: kami tidak menyimpan nomor kartu. Pembayaran diproses oleh mitra pembayaran kami, dan kami hanya menyimpan referensi transaksi dan metode pembayarannya. Untuk mengirim uang kepada Anda, yaitu penarikan dana penjual atau pengembalian dana atas pembayaran via transfer bank, kami menyimpan rekening bank yang Anda berikan (bank, nomor rekening, dan nama pemilik).",
          "Yang tidak kami lakukan: kami tidak memakai alat analitik, iklan, atau pelacak pihak ketiga, tidak memuat skrip dari pihak ketiga, dan tidak menjual data pribadi. Huruf (font) situs ini disajikan dari server kami sendiri.",
        ],
      },
      {
        id: "cookies",
        heading: "3. Cookie",
        blocks: [
          "Kami hanya memakai dua cookie, dan keduanya diperlukan agar situs berfungsi. Karena tidak ada cookie pelacak, kami tidak menampilkan spanduk persetujuan cookie.",
          {
            list: [
              "Cookie sesi (\"regear_session\"): menjaga Anda tetap masuk. Berisi kode acak; kami hanya menyimpan hash-nya. Tidak bisa dibaca JavaScript dan berlaku 30 hari, diperpanjang selama Anda aktif.",
              "Cookie bahasa (\"regear_lang\"): mengingat pilihan Bahasa Indonesia atau English selama 1 tahun.",
            ],
          },
        ],
      },
      {
        id: "purposes",
        heading: "4. Untuk apa data dipakai dan dasar hukumnya",
        blocks: [
          {
            list: [
              "Menjalankan akun, iklan, pesanan, pembayaran yang ditahan, pengiriman, pengembalian, dan sengketa, termasuk mengirim email tentang semua itu: untuk melaksanakan perjanjian dengan Anda (Syarat & Ketentuan).",
              "Memverifikasi identitas penjual: atas dasar persetujuan eksplisit Anda, yang bisa Anda tarik kembali.",
              "Menjaga keamanan, mencegah penipuan dan penyalahgunaan, serta mencatat tindakan penting: kepentingan yang sah untuk melindungi pengguna dan platform.",
              "Menyimpan catatan transaksi: kewajiban hukum, termasuk aturan pencatatan keuangan dan perpajakan.",
            ],
          },
          "Kami tidak mengirim pemasaran dan tidak membuat profil Anda untuk iklan. Kami tidak mengambil keputusan otomatis yang berdampak hukum pada Anda; keputusan sengketa dan verifikasi diambil oleh petugas ReGear.",
        ],
      },
      {
        id: "sharing",
        heading: "5. Siapa yang bisa melihat data Anda",
        blocks: [
          {
            list: [
              "Publik: nama, deskripsi, dan lokasi toko; iklan dan fotonya; ulasan, yang hanya menampilkan nama depan pembeli.",
              "Penjual dalam pesanan Anda: nama penerima, nomor telepon, alamat pengiriman, catatan untuk kurir, dan pin lokasi (jika ada), hanya setelah Anda membayar, agar barang bisa dikirim.",
              "Pembeli dalam pesanan Anda: informasi toko dan nomor resi pengiriman.",
              "Pihak dalam sengketa: pembeli, penjual, dan petugas ReGear bisa membaca seluruh pesan sengketa.",
              "Petugas ReGear: data yang diperlukan untuk meninjau verifikasi, sengketa, dan moderasi. Setiap kali dokumen identitas dilihat, hal itu tercatat.",
              "Penyedia layanan kami: penyedia hosting dan penyimpanan, penyedia pengiriman email, Google (jika Anda masuk dengan Google), dan mitra pembayaran. Mereka memproses data hanya atas instruksi kami. Saat Anda membuka peta untuk memasang pin alamat, browser Anda memuat peta dan hasil pencarian tempat langsung dari OpenStreetMap, yang menerima alamat IP dan kata kunci pencarian Anda. Jasa ekspedisi menerima alamat dari penjual yang mengirim barang.",
              "Otoritas: bila diwajibkan oleh hukum atau perintah yang sah.",
            ],
          },
          "Jika penyedia layanan kami menyimpan data di luar Indonesia, kami memastikan tingkat pelindungan data yang setara atau lebih tinggi sesuai UU PDP.",
        ],
      },
      {
        id: "retention",
        heading: "6. Berapa lama data disimpan",
        blocks: [
          {
            list: [
              "Data akun, toko, dan iklan: selama akun Anda ada.",
              "Sesi login: berakhir setelah 30 hari tidak aktif, saat Anda keluar, atau saat Anda mengubah kata sandi (sesi di perangkat lain ikut berakhir).",
              `Pesanan yang tidak dibayar dalam ${PAYMENT_HOLD_MINUTES} menit dibatalkan otomatis.`,
              `Foto yang diunggah tetapi tidak dipakai di iklan dihapus setelah ${ORPHAN_UPLOAD_DAYS} hari.`,
              "Penghitung percobaan dihapus otomatis setelah masa berlakunya habis.",
              `Tautan konfirmasi email berlaku 24 jam dan tautan atur ulang kata sandi 1 jam; keduanya hanya bisa dipakai sekali. Catatan email yang dikirim dihapus setelah ${EMAIL_LOG_RETENTION_DAYS} hari.`,
              `Catatan keamanan disimpan selama ${AUDIT_YEARS} tahun, lalu dihapus otomatis.`,
              "Data verifikasi dan foto dokumen identitas: selama akun Anda ada, agar status terverifikasi bisa dibuktikan; dihapus saat akun dihapus.",
              "Catatan pesanan, ulasan, dan sengketa: tetap disimpan setelah akun dihapus, tanpa nama dan data kontak Anda, selama diwajibkan oleh hukum dan agar riwayat pihak lain dalam transaksi tetap utuh.",
            ],
          },
        ],
      },
      {
        id: "security",
        heading: "7. Keamanan",
        blocks: [
          "Kami melindungi data dengan koneksi terenkripsi (HTTPS), hash kata sandi yang kuat, sesi yang bisa dicabut, penyimpanan privat terpisah untuk dokumen identitas yang hanya bisa diakses petugas, pencatatan akses, dan pembatasan percobaan untuk mencegah tebakan kata sandi.",
          "Jika terjadi kegagalan pelindungan data pribadi, kami akan memberi tahu Anda dan otoritas pelindungan data secara tertulis paling lambat 3 × 24 jam, sesuai UU PDP.",
        ],
      },
      {
        id: "rights",
        heading: "8. Hak Anda",
        blocks: [
          "Berdasarkan UU PDP, Anda berhak untuk:",
          {
            list: [
              "mendapat informasi tentang pemrosesan data Anda (kebijakan ini) dan meminta salinannya;",
              "memperbaiki data yang tidak akurat: nama bisa diubah di [Pengaturan](/account/settings), data lainnya lewat permintaan ke kami;",
              "menghapus akun dan data pribadi Anda sendiri di [Pengaturan](/account/settings), setelah pesanan yang berjalan selesai;",
              "menarik persetujuan, misalnya untuk data verifikasi (status terverifikasi Anda akan hilang);",
              "menolak atau meminta pembatasan pemrosesan tertentu;",
              "mengajukan keluhan kepada otoritas pelindungan data pribadi.",
            ],
          },
          "Kirim permintaan ke {email}. Kami mungkin meminta Anda membuktikan bahwa Anda pemilik akun, dan akan menanggapi dalam batas waktu yang ditetapkan UU PDP.",
        ],
      },
      {
        id: "children",
        heading: "9. Usia pengguna",
        blocks: ["ReGear ditujukan untuk pengguna berusia 18 tahun ke atas. Kami tidak dengan sengaja mengumpulkan data anak. Jika Anda yakin seorang anak membuat akun, hubungi kami agar akunnya bisa dihapus."],
      },
      {
        id: "changes",
        heading: "10. Perubahan kebijakan",
        blocks: [
          "Jika kebijakan ini berubah, kami memperbarui tanggal berlakunya di atas. Perubahan penting akan kami umumkan di situs sebelum berlaku, dan bila perubahan itu memerlukan persetujuan baru, kami akan memintanya.",
        ],
      },
      {
        id: "contact",
        heading: "11. Kontak",
        blocks: ["{operator}, {address}. Email: {email}."],
      },
    ],
  },
  en: {
    title: "Privacy Policy",
    intro:
      "This policy explains what personal data ReGear collects, why, who can see it, how long it is kept, and your rights. It follows Indonesia's Personal Data Protection Law (Law No. 27 of 2022, \"UU PDP\").",
    sections: [
      {
        id: "who",
        heading: "1. Who we are",
        blocks: [
          "ReGear is a marketplace for pre-owned electronics operated by {operator}, of {address} (\"ReGear\", \"we\"). We are the controller of the personal data described here.",
          "Questions or requests about your data can be sent to {email}.",
        ],
      },
      {
        id: "collect",
        heading: "2. What we collect",
        blocks: [
          "We only collect what is needed to run the marketplace:",
          {
            list: [
              "Account: your name, email address and password. Passwords are stored as a one-way hash (scrypt), so even we can't read them. We also record which version of these Terms and this Policy you agreed to, and when.",
              "Sign in with Google: if you choose it, Google gives us your Google account ID, email address and name (the \"openid\", \"email\" and \"profile\" permissions). We receive no contacts, files or other Google data.",
              "Purchases: the addresses you save (recipient name, phone number, address, a note for the courier, and a map pin if you add one), orders, returns, disputes and the reviews you write.",
              "Selling: your shop name, description and location; your listings, condition reports and item photos. When a photo is uploaded we re-create the image, which removes metadata such as GPS location and camera serial numbers.",
              "Seller verification (optional): your legal name, phone number, address, document type, the last four characters of the document number (the full number is never stored) and a photo of your ID document. This is only collected with your explicit consent when you apply.",
              "Messages: what you write in disputes, return notes and cancellation reasons.",
              `Emails from us: we email you about your account and orders: confirming your email address, password reset links, order, return and dispute updates, and seller verification results. We keep a record of the emails sent (recipient, type and time) for ${EMAIL_LOG_RETENTION_DAYS} days.`,
              "Technical and security data: IP address and browser type for sign-in sessions; security records such as sign-ins, sign-outs, password changes, verification decisions and every time staff view an ID document; and attempt counters (for example sign-in attempts per IP or email) that prevent abuse.",
            ],
          },
          "Payments: we don't store card numbers. Payments are processed by our payment partner, and we only keep the transaction reference and how you paid. To send you money, as a seller's withdrawal or as the refund of a bank-transfer payment, we store the bank account you give us (bank, account number and holder name).",
          "What we don't do: we use no third-party analytics, advertising or tracking tools, load no third-party scripts and never sell personal data. The site's fonts are served from our own server.",
        ],
      },
      {
        id: "cookies",
        heading: "3. Cookies",
        blocks: [
          "We use only two cookies, both needed for the site to work. Because there are no tracking cookies, we don't show a cookie consent banner.",
          {
            list: [
              "Session cookie (\"regear_session\"): keeps you signed in. It holds a random code; we store only its hash. JavaScript can't read it, and it lasts 30 days, renewed while you're active.",
              "Language cookie (\"regear_lang\"): remembers whether you chose Bahasa Indonesia or English, for 1 year.",
            ],
          },
        ],
      },
      {
        id: "purposes",
        heading: "4. Why we use it, and on what legal basis",
        blocks: [
          {
            list: [
              "Running your account, listings, orders, held payments, shipping, returns and disputes, including emailing you about them: to perform our agreement with you (the Terms).",
              "Verifying sellers' identity: your explicit consent, which you can withdraw.",
              "Keeping the platform secure, preventing fraud and abuse, and recording important actions: our legitimate interest in protecting users and the platform.",
              "Keeping transaction records: legal obligations, including financial and tax record-keeping rules.",
            ],
          },
          "We don't send marketing and don't profile you for advertising. We make no automated decisions with legal effects on you; dispute and verification decisions are made by ReGear staff.",
        ],
      },
      {
        id: "sharing",
        heading: "5. Who can see your data",
        blocks: [
          {
            list: [
              "Everyone: your shop's name, description and location; listings and their photos; reviews, which show only the buyer's first name.",
              "The seller in your order: the recipient name, phone number, shipping address, courier note and map pin (if any), only after you pay, so they can ship the item.",
              "The buyer in your order: your shop details and the shipment tracking number.",
              "People in a dispute: the buyer, the seller and ReGear staff can read the whole dispute thread.",
              "ReGear staff: what they need to review verifications, disputes and moderation. Every view of an ID document is recorded.",
              "Our service providers: hosting and storage, email delivery, Google (if you sign in with Google) and our payment partner. They process data only on our instructions. When you open the map to pin an address, your browser loads the map and place-search results directly from OpenStreetMap, which receives your IP address and what you search for. Couriers receive the address from the seller who ships the item.",
              "Authorities: when required by law or a valid order.",
            ],
          },
          "If our providers store data outside Indonesia, we make sure it is protected to a standard equal to or higher than UU PDP requires.",
        ],
      },
      {
        id: "retention",
        heading: "6. How long we keep it",
        blocks: [
          {
            list: [
              "Account, shop and listing data: for as long as your account exists.",
              "Sign-in sessions: end after 30 days of inactivity, when you sign out, or when you change your password (sessions on other devices end too).",
              `Orders not paid within ${PAYMENT_HOLD_MINUTES} minutes are cancelled automatically.`,
              `Photos uploaded but never used in a listing are deleted after ${ORPHAN_UPLOAD_DAYS} day${ORPHAN_UPLOAD_DAYS === 1 ? "" : "s"}.`,
              "Attempt counters are deleted automatically once they expire.",
              `Email confirmation links work for 24 hours and password reset links for 1 hour, once each. The record of sent emails is deleted after ${EMAIL_LOG_RETENTION_DAYS} days.`,
              `Security records are kept for ${AUDIT_YEARS} years, then deleted automatically.`,
              "Verification data and ID document photos: for as long as your account exists, so your verified status can be shown to be genuine; deleted when your account is deleted.",
              "Order, review and dispute records: kept after an account is deleted, without your name and contact details, for as long as the law requires and so the other party's history stays complete.",
            ],
          },
        ],
      },
      {
        id: "security",
        heading: "7. Security",
        blocks: [
          "We protect data with encrypted connections (HTTPS), strong password hashing, revocable sessions, separate private storage for ID documents that only staff can access, access logging, and attempt limits that stop password guessing.",
          "If a personal data breach happens, we will notify you and the data protection authority in writing within 3 × 24 hours, as UU PDP requires.",
        ],
      },
      {
        id: "rights",
        heading: "8. Your rights",
        blocks: [
          "Under UU PDP you have the right to:",
          {
            list: [
              "be informed about how your data is processed (this policy) and request a copy of it;",
              "correct inaccurate data: change your name in [Settings](/account/settings), anything else by asking us;",
              "delete your account and personal data yourself in [Settings](/account/settings), once any orders in progress are finished;",
              "withdraw consent, for example for verification data (you'll lose your verified status);",
              "object to or ask us to restrict certain processing;",
              "complain to the personal data protection authority.",
            ],
          },
          "Send requests to {email}. We may ask you to prove you own the account, and will respond within the time limits UU PDP sets.",
        ],
      },
      {
        id: "children",
        heading: "9. Age",
        blocks: ["ReGear is for people aged 18 and over. We don't knowingly collect children's data. If you believe a child has created an account, contact us so it can be removed."],
      },
      {
        id: "changes",
        heading: "10. Changes to this policy",
        blocks: [
          "If this policy changes, we update the effective date above. We'll announce significant changes on the site before they take effect, and ask for your consent again where a change needs it.",
        ],
      },
      {
        id: "contact",
        heading: "11. Contact",
        blocks: ["{operator}, {address}. Email: {email}."],
      },
    ],
  },
};

const terms: Record<Locale, LegalDocument> = {
  id: {
    title: "Syarat & Ketentuan",
    intro:
      "Syarat ini mengatur penggunaan ReGear oleh pembeli dan penjual. Dengan membuat akun atau menggunakan ReGear, Anda menyetujui Syarat ini dan [Kebijakan Privasi](/privacy).",
    sections: [
      {
        id: "about",
        heading: "1. Tentang ReGear",
        blocks: [
          "ReGear, yang dikelola oleh {operator}, adalah platform yang mempertemukan pembeli dan penjual elektronik bekas. Penjual adalah pihak yang menjual barang; ReGear bukan pemilik atau penjual barang yang diiklankan, tetapi menyediakan laporan kondisi terstruktur, verifikasi penjual, penahanan pembayaran, serta penanganan pengembalian dan sengketa.",
          "Syarat ini tidak mengurangi hak Anda sebagai konsumen berdasarkan Undang-Undang No. 8 Tahun 1999 tentang Perlindungan Konsumen.",
        ],
      },
      {
        id: "accounts",
        heading: "2. Akun",
        blocks: [
          {
            list: [
              "Anda harus berusia minimal 18 tahun.",
              "Berikan informasi yang benar dan jaga kerahasiaan kata sandi Anda. Anda bertanggung jawab atas aktivitas di akun Anda.",
              "Satu orang atau usaha boleh memiliki satu akun, yang bisa dipakai untuk membeli dan menjual.",
              "Anda bisa menghapus akun kapan saja di [Pengaturan](/account/settings) setelah semua pesanan yang berjalan selesai.",
            ],
          },
        ],
      },
      {
        id: "selling",
        heading: "3. Menjual",
        blocks: [
          "Dengan menerbitkan iklan, Anda menyatakan dan menjamin bahwa:",
          {
            list: [
              "barang itu milik Anda atau Anda berhak menjualnya, dan diperoleh secara sah;",
              "laporan kondisi akurat dan lengkap: grade, hasil setiap pemeriksaan, kesehatan baterai, masalah yang diketahui, dan aksesori sesuai keadaan sebenarnya, dan foto menunjukkan barang yang dijual;",
              "untuk ponsel dan perangkat seluler, nomor IMEI/seri tidak dilaporkan hilang, dicuri, atau diblokir, dan Anda menyebutkan dengan jelas jika perangkat tidak bisa memakai jaringan seluler di Indonesia;",
              "data pribadi dan akun (misalnya iCloud, akun Google, atau akun konsol) sudah dihapus dari perangkat, kecuali iklan dengan jelas menyatakan barang dijual untuk suku cadang;",
              "garansi yang Anda tawarkan akan Anda penuhi sesuai ketentuannya.",
            ],
          },
          "Setelah pesanan dibayar, kirim barang dalam waktu yang wajar dengan jasa ekspedisi dan masukkan nomor resi yang valid. Jangan meminta pembeli membayar atau bertransaksi di luar ReGear.",
          "Penjual yang belum terverifikasi dapat memiliki hingga 5 iklan aktif. Verifikasi identitas bersifat opsional dan memerlukan persetujuan Anda atas pemrosesan data identitas sebagaimana dijelaskan di [Kebijakan Privasi](/privacy).",
        ],
      },
      {
        id: "prohibited",
        heading: "4. Barang yang dilarang",
        blocks: [
          "Barang berikut tidak boleh dijual di ReGear:",
          {
            list: [
              "barang curian, hasil penipuan, atau yang asal-usulnya tidak bisa Anda pertanggungjawabkan;",
              "barang palsu atau tiruan yang diiklankan sebagai asli;",
              "perangkat yang masih terkunci ke akun orang lain, kecuali diiklankan dengan jelas sebagai \"untuk suku cadang\";",
              "perangkat dengan IMEI yang diblokir atau dimanipulasi;",
              "perangkat yang dilarang atau memerlukan izin khusus di Indonesia, seperti pengacak sinyal (jammer);",
              "baterai yang menggembung, bocor, atau rusak sehingga tidak aman dikirim;",
              "perangkat yang berisi data pribadi orang lain, atau perangkat lunak bajakan yang dijual sebagai bagian dari barang;",
              "barang selain elektronik dan aksesorinya.",
            ],
          },
          "Kami dapat menghapus iklan yang melanggar dan menangguhkan akun penjualnya.",
        ],
      },
      {
        id: "buying",
        heading: "5. Membeli dan pembayaran",
        blocks: [
          {
            list: [
              "Harga dan ongkos kirim ditentukan penjual dan ditampilkan sebelum Anda membayar. Pembeli tidak dikenai biaya platform.",
              `Checkout tidak memesan barang: barang tetap dijual sampai Anda mulai membayar, lalu disimpan untuk Anda selama ${PAY_HOLD_MINUTES} menit. Jika pembayaran tidak selesai, pesanan dibatalkan dan barang kembali dijual. Pesanan yang belum mulai dibayar dibatalkan setelah ${PAYMENT_HOLD_MINUTES} menit.`,
              "Pembayaran Anda ditahan oleh ReGear dan belum diteruskan ke penjual sampai Anda menerima barang atau batas waktu pengembalian berakhir.",
              `Anda bisa membayar dengan GoPay, ShopeePay, QRIS (hingga ${formatMoney(QRIS_MAX_IDR)} per pembayaran), atau transfer bank (virtual account). Pengembalian dana untuk transfer bank tidak bisa dilakukan otomatis: kami mentransfernya ke rekening yang Anda berikan di halaman pesanan, dalam ${REFUND_BY_HAND_DAYS} hari kerja setelah Anda memberikannya.`,
              "Setelah dibayar, alamat dan nomor telepon pengiriman Anda dibagikan ke penjual untuk pengiriman.",
            ],
          },
        ],
      },
      {
        id: "delivery",
        heading: "6. Pengiriman dan penerimaan",
        blocks: [
          "Penjual mengirim barang dengan nomor resi. Konfirmasikan penerimaan setelah barang tiba, lalu periksa barang sesuai laporan kondisinya. Jika penerimaan tidak dikonfirmasi, pesanan ditandai diterima secara otomatis 21 hari setelah dikirim.",
        ],
      },
      {
        id: "returns",
        heading: "7. Pengembalian",
        blocks: [
          "Setiap iklan menampilkan batas waktu pengembalian (0–30 hari setelah barang diterima) yang ditetapkan penjual. Dalam batas waktu itu Anda bisa mengajukan pengembalian. Penjual menyetujui atau menolaknya dengan alasan. Jika disetujui, kirim barang kembali dengan nomor resi; dana Anda dikembalikan penuh setelah penjual mengonfirmasi barang sudah diterima.",
          "Jika barang tidak sesuai laporan kondisi, Anda tetap bisa membuka sengketa walaupun pengembalian ditolak atau iklan tidak menawarkan pengembalian.",
        ],
      },
      {
        id: "disputes",
        heading: "8. Sengketa",
        blocks: [
          "Pembeli atau penjual bisa membuka sengketa untuk pesanan yang bermasalah, misalnya barang tidak diterima, tidak sesuai deskripsi, rusak, atau palsu. Selama sengketa berlangsung, pembayaran dibekukan. Kedua pihak menyampaikan penjelasan dan bukti di halaman sengketa.",
          "Petugas ReGear memutuskan berdasarkan laporan kondisi, foto, riwayat pengiriman, dan bukti dari kedua pihak: pengembalian dana penuh, pengembalian dana sebagian, atau pembayaran diteruskan ke penjual. Keputusan ini mengikat di dalam platform, tanpa mengurangi hak hukum Anda.",
        ],
      },
      {
        id: "fees",
        heading: "9. Penyelesaian pesanan dan biaya",
        blocks: [
          `Pesanan selesai ketika pembeli menerima barang, atau ${AUTO_COMPLETE_DAYS_AFTER_DELIVERY_BUFFER} hari setelah batas waktu pengembalian berakhir tanpa pengajuan. Saat itu pembayaran diteruskan ke penjual setelah dipotong biaya ReGear sebesar ${FEE} dari harga barang. Ongkos kirim diteruskan ke penjual tanpa potongan.`,
        ],
      },
      {
        id: "reviews",
        heading: "10. Ulasan",
        blocks: ["Hanya pembeli dengan pesanan selesai yang bisa memberi ulasan, satu kali per pesanan. Ulasan harus jujur dan berdasarkan transaksi itu. Kami dapat menghapus ulasan yang kasar, berisi data pribadi, atau tidak berhubungan dengan transaksi."],
      },
      {
        id: "conduct",
        heading: "11. Perilaku yang dilarang",
        blocks: [
          {
            list: [
              "bertransaksi atau meminta pembayaran di luar ReGear untuk barang yang diiklankan di sini;",
              "membagikan data pembayaran atau data pribadi orang lain di pesan;",
              "iklan palsu atau menyesatkan, atau memanipulasi ulasan;",
              "melecehkan atau mengancam pengguna lain;",
              "mengambil data situs secara otomatis, mengganggu, atau mencoba membobol sistem ReGear.",
            ],
          },
        ],
      },
      {
        id: "moderation",
        heading: "12. Moderasi dan penangguhan",
        blocks: ["Kami dapat menghapus iklan, membatasi fitur, atau menangguhkan akun yang melanggar Syarat ini atau hukum. Pesanan yang sedang berjalan tetap diselesaikan agar pembeli dan penjual terlindungi. Tindakan moderasi dicatat."],
      },
      {
        id: "liability",
        heading: "13. Tanggung jawab",
        blocks: [
          "Penjual bertanggung jawab atas barang, deskripsi, dan garansi yang mereka tawarkan. ReGear bertanggung jawab menjalankan platform, termasuk menahan dan meneruskan pembayaran serta menangani sengketa sesuai Syarat ini, dan bertanggung jawab atas kerugian yang disebabkan oleh kelalaian kami sesuai hukum yang berlaku.",
          "Kami berupaya menjaga ReGear tetap tersedia, tetapi gangguan sementara bisa terjadi, misalnya saat pemeliharaan.",
        ],
      },
      {
        id: "changes",
        heading: "14. Perubahan Syarat",
        blocks: ["Jika Syarat ini berubah, kami memperbarui tanggal berlakunya di atas dan mengumumkan perubahan penting di situs sebelum berlaku. Pesanan yang sudah dibuat tetap mengikuti Syarat yang berlaku saat pesanan dibuat."],
      },
      {
        id: "law",
        heading: "15. Hukum yang berlaku",
        blocks: ["Syarat ini tunduk pada hukum Republik Indonesia. Perselisihan diselesaikan terlebih dahulu secara musyawarah; jika tidak tercapai, melalui {court}, tanpa mengurangi hak konsumen untuk menempuh penyelesaian sengketa konsumen sesuai undang-undang."],
      },
      {
        id: "contact",
        heading: "16. Kontak",
        blocks: ["{operator}, {address}. Email: {email}."],
      },
    ],
  },
  en: {
    title: "Terms & Conditions",
    intro: "These Terms govern how buyers and sellers use ReGear. By creating an account or using ReGear, you agree to these Terms and the [Privacy Policy](/privacy).",
    sections: [
      {
        id: "about",
        heading: "1. About ReGear",
        blocks: [
          "ReGear, operated by {operator}, is a platform that connects buyers and sellers of pre-owned electronics. Sellers sell the items; ReGear does not own or sell the listed items, but provides structured condition reports, seller verification, held payments, and handling of returns and disputes.",
          "These Terms don't reduce your rights as a consumer under Indonesia's Consumer Protection Law (Law No. 8 of 1999).",
        ],
      },
      {
        id: "accounts",
        heading: "2. Accounts",
        blocks: [
          {
            list: [
              "You must be at least 18 years old.",
              "Give accurate information and keep your password secret. You're responsible for activity on your account.",
              "Each person or business may have one account, which can be used to both buy and sell.",
              "You can delete your account at any time in [Settings](/account/settings) once all orders in progress are finished.",
            ],
          },
        ],
      },
      {
        id: "selling",
        heading: "3. Selling",
        blocks: [
          "By publishing a listing, you confirm and guarantee that:",
          {
            list: [
              "the item is yours or you have the right to sell it, and it was obtained lawfully;",
              "the condition report is accurate and complete: the grade, every check result, battery health, known issues and accessories match the item, and the photos show the item being sold;",
              "for phones and cellular devices, the IMEI/serial number is not reported lost, stolen or blocked, and you clearly say if the device can't use cellular networks in Indonesia;",
              "personal data and accounts (such as iCloud, Google or console accounts) have been removed from the device, unless the listing clearly says it is sold for parts;",
              "you will honour any warranty you offer, on its stated terms.",
            ],
          },
          "Once an order is paid, ship the item within a reasonable time with a courier and enter a valid tracking number. Don't ask buyers to pay or trade outside ReGear.",
          "Unverified sellers can have up to 5 active listings. Identity verification is optional and requires your consent to the processing of identity data described in the [Privacy Policy](/privacy).",
        ],
      },
      {
        id: "prohibited",
        heading: "4. Prohibited items",
        blocks: [
          "The following may not be sold on ReGear:",
          {
            list: [
              "stolen goods, goods obtained by fraud, or items whose origin you can't account for;",
              "counterfeits or replicas advertised as genuine;",
              "devices still locked to someone else's account, unless clearly listed as \"for parts\";",
              "devices with a blocked or tampered IMEI;",
              "devices that are banned or need a special licence in Indonesia, such as signal jammers;",
              "swollen, leaking or damaged batteries that are unsafe to ship;",
              "devices containing someone else's personal data, or pirated software sold as part of the item;",
              "anything other than electronics and their accessories.",
            ],
          },
          "We may remove listings that break these rules and suspend the seller's account.",
        ],
      },
      {
        id: "buying",
        heading: "5. Buying and payment",
        blocks: [
          {
            list: [
              "The seller sets the price and shipping cost, shown before you pay. Buyers pay no platform fee.",
              `Checking out doesn't reserve the item: it stays on sale until you start paying, and is then held for you for ${PAY_HOLD_MINUTES} minutes. If payment isn't completed, the order is cancelled and the item goes back on sale. An order you haven't started paying for is cancelled after ${PAYMENT_HOLD_MINUTES} minutes.`,
              "Your payment is held by ReGear and not passed to the seller until you accept the item or the return window ends.",
              `You can pay with GoPay, ShopeePay, QRIS (up to ${formatMoney(QRIS_MAX_IDR)} per payment) or bank transfer (virtual account). A bank transfer can't be refunded automatically: we transfer the refund to an account you give on the order page, within ${REFUND_BY_HAND_DAYS} business days of you giving it.`,
              "Once paid, your shipping address and phone number are shared with the seller so they can ship.",
            ],
          },
        ],
      },
      {
        id: "delivery",
        heading: "6. Shipping and delivery",
        blocks: [
          "The seller ships with a tracking number. Confirm delivery when the item arrives, then check it against its condition report. If delivery isn't confirmed, the order is marked delivered automatically 21 days after shipping.",
        ],
      },
      {
        id: "returns",
        heading: "7. Returns",
        blocks: [
          "Every listing shows the return window (0–30 days after delivery) set by the seller. Within that window you can request a return. The seller approves or rejects it with a reason. If approved, ship the item back with a tracking number; you're refunded in full once the seller confirms they've received it.",
          "If the item doesn't match its condition report, you can still open a dispute even if a return is rejected or the listing offers no returns.",
        ],
      },
      {
        id: "disputes",
        heading: "8. Disputes",
        blocks: [
          "The buyer or the seller can open a dispute about a problem order, for example an item not received, not as described, damaged or counterfeit. While a dispute is open, the payment is frozen. Both sides give their account and evidence on the dispute page.",
          "ReGear staff decide based on the condition report, photos, shipping history and both sides' evidence: a full refund, a partial refund, or release of the payment to the seller. The decision is binding within the platform and doesn't limit your legal rights.",
        ],
      },
      {
        id: "fees",
        heading: "9. Completion and fees",
        blocks: [
          `An order completes when the buyer accepts the item, or ${AUTO_COMPLETE_DAYS_AFTER_DELIVERY_BUFFER} days after the return window ends without a request. The payment is then released to the seller minus ReGear's fee of ${FEE} of the item price. Shipping is passed on to the seller in full.`,
        ],
      },
      {
        id: "reviews",
        heading: "10. Reviews",
        blocks: ["Only buyers with a completed order can leave a review, once per order. Reviews must be honest and about that transaction. We may remove reviews that are abusive, contain personal data or aren't about the transaction."],
      },
      {
        id: "conduct",
        heading: "11. Prohibited conduct",
        blocks: [
          {
            list: [
              "trading, or asking for payment, outside ReGear for items listed here;",
              "sharing payment details or other people's personal data in messages;",
              "fake or misleading listings, or manipulating reviews;",
              "harassing or threatening other users;",
              "scraping, disrupting or trying to break into ReGear's systems.",
            ],
          },
        ],
      },
      {
        id: "moderation",
        heading: "12. Moderation and suspension",
        blocks: ["We may remove listings, limit features or suspend accounts that break these Terms or the law. Orders in progress are still completed so buyers and sellers stay protected. Moderation actions are recorded."],
      },
      {
        id: "liability",
        heading: "13. Liability",
        blocks: [
          "Sellers are responsible for their items, descriptions and any warranty they offer. ReGear is responsible for running the platform, including holding and releasing payments and handling disputes as these Terms describe, and is liable for losses caused by our negligence as the applicable law provides.",
          "We work to keep ReGear available, but temporary interruptions can happen, for example during maintenance.",
        ],
      },
      {
        id: "changes",
        heading: "14. Changes to these Terms",
        blocks: ["If these Terms change, we update the effective date above and announce significant changes on the site before they take effect. Orders already placed follow the Terms in force when they were placed."],
      },
      {
        id: "law",
        heading: "15. Governing law",
        blocks: ["These Terms are governed by the laws of the Republic of Indonesia. Disputes are first settled amicably; failing that, through the {court}, without limiting consumers' right to use the consumer dispute settlement routes the law provides."],
      },
      {
        id: "contact",
        heading: "16. Contact",
        blocks: ["{operator}, {address}. Email: {email}."],
      },
    ],
  },
};

export const LEGAL_DOCUMENTS = { privacy, terms };
export type LegalDocumentKey = keyof typeof LEGAL_DOCUMENTS;
