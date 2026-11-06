# Turnuva Panosu

Okul beden eğitimi turnuvaları için Türkçe turnuva yönetim sitesi. Tek okul, tek yönetici, sınırsız turnuva.
Öğrenciler ve ziyaretçiler giriş yapmadan fikstürü, puan durumunu, eleme ağacını ve şampiyonları telefondan izler;
yönetici (beden eğitimi öğretmeni) şifreyle girip her şeyi yönetir.

Site **Netlify’ın ücretsiz planında** çalışır; ücretli hiçbir servis gerekmez.

---

## İçindekiler

1. [Neler yapabilir?](#neler-yapabilir)
2. [Teknik mimari](#teknik-mimari)
3. [Netlify’a yayınlama (deploy)](#netlifya-yayınlama-deploy)
4. [Yönetici şifresini değiştirme](#yönetici-şifresini-değiştirme)
5. [Bilgisayarda çalıştırma (isteğe bağlı)](#bilgisayarda-çalıştırma-isteğe-bağlı)
6. [Öğretmen için kısa kullanım kılavuzu](#öğretmen-için-kısa-kullanım-kılavuzu)
7. [Yapılan varsayımlar](#yapılan-varsayımlar)
8. [Karar bekleyen konu: branşa özel istatistikler](#karar-bekleyen-konu-branşa-özel-istatistikler)
9. [Testler](#testler)
10. [Proje yapısı](#proje-yapısı)

---

## Neler yapabilir?

**Herkese açık (giriş gerekmez)**
- Ana sayfa: devam eden turnuvalar, geçmiş turnuvalar, yıl ve branşa göre filtrelenebilen şampiyonlar listesi.
- Her turnuvanın paylaşılabilir ayrı bir bağlantısı vardır (`/t/turnuva-adi-xxxxx`).
- Maç programı (tura veya tarihe göre, takıma göre filtre), grup tabloları / puan durumu, görsel eleme ağacı.
- Fikstürü **Excel (.xlsx)** olarak indirme (takım listesi değil, gerçek eşleşmeler ve skorlar) ve **görsel (PNG)** olarak kaydetme.
- Kesinleşmiş kurayı “canlı kura” olarak yeniden izleme (projeksiyonda öğrencilerle birlikte).
- Telefona göre tasarlandı: tablolar dar ekranda sadeleşir, eleme ağacı telefonda tur listesi olarak açılır.

**Yönetici**
- **Adım adım yeni turnuva sihirbazı** (ana sayfadaki “+ Yeni turnuva” düğmesi): Bilgiler → Takımlar → Format → Puanlama → Özet.
  Her adım tamamlanmadan sonrakine geçilemez; böylece hiçbir ayar atlanmaz. Yarım kalan kurulum tarayıcıda saklanır, sayfa kapansa bile kaldığı yerden devam eder.
- Turnuva düzenleme, arşivleme (kalıcı silme yok). Durumlar: Taslak (herkese kapalı), Devam ediyor, Bitti.
- Takım/katılımcı ekleme (her satıra bir ad yazarak toplu ekleme), güç puanını listeden seçme, ad düzeltme, oyuncu listesi, 1–10 güç puanı, ayrılan takımın yerine yeni takım koyma, takımı “çekildi” yapma (kalan maçları hükmen kaybeder).
- Aşamalı format: **ön eleme, grup, lig, eleme** aşamaları istenen sırada birleştirilir.
  Hazır şablonlar: Direkt eleme · Grup + eleme · Ön eleme + grup + eleme · Lig. Her ayar değiştirilebilir.
- Ayarlar: grup sayısı/büyüklüğü, gruptan çıkan sayısı, tek/çift maç, çapraz (A1-B2, B1-A2) / sıralı / elle eşleşme,
  aynı gruptan çıkanların ilk turda karşılaşmaması, en iyi üçüncüler (veya en iyi X.’ler), üçüncülük maçı,
  sıralama kriterleri ve sırası (ikili maç puanı/averajı/atılan, genel averaj, atılan, az yenilen, galibiyet).
- Takım sayısı uymadığında sistem geçerli seçenekleri listeler (farklı grup büyüklüğü, ön eleme, en iyi üçüncüler, bay geçme).
- Kura: güce göre dengeli (torbalar / seri başı) veya tamamen rastgele; aynı puanlıların sırası kurayla belirlenir.
  Kesinleşmeden önce okunabilir önizleme (ör. *“17 takım: 1 ön eleme maçı (Takım P - Takım R), 15 takım direkt 16'lı tabloya.”*),
  önizlemede her takım/eşleşme değiştirilebilir, **canlı kura** ile takımlar tek tek çekilerek gösterilir.
- Kuradan sonra oynanmamış eşleşmeler elle değiştirilebilir; gruplar arasında takım takası yapılabilir.
  Oynanmış maçları etkileyen değişiklikte ve yeniden kurada uyarı verilir, onay istenir.
- Skor, tarih, saat, saha, not; eleme beraberliğinde penaltı skoru veya kazanan seçimi; hükmen sonuç.
- Kriterlerle çözülemeyen eşitlikte yönetici sıralamayı belirler.
- Aşama bitince üst tura çıkanlar otomatik hesaplanır; yönetici onaylar veya düzeltir.
- Turnuva bitince sistem şampiyonu önerir; yönetici onaylar/değiştirir, kayıt arşive “2026-27 · 9-A” biçiminde eklenir.
- Eski turnuvaları fikstürsüz, tek ekrandan şampiyonlar arşivine ekleme.
- **Değişiklik geçmişi:** her kayıt saklanır (son 40), istenen sürüme tek tıkla dönülür. Yanlışlıkla silinen skor geri gelir.
- **Yedek:** tüm veriyi tek JSON dosyası olarak indirme ve geri yükleme.
- Skor ve kura gibi veri değişiklikleri **yeni deploy gerektirmez**.

---

## Teknik mimari

| Katman | Seçim | Neden |
|---|---|---|
| Arayüz | React + TypeScript + Vite (tek sayfa uygulaması) | Hızlı, statik dosya olarak Netlify’da barındırılır |
| Sunucu | **Netlify Functions** (tek fonksiyon: `netlify/functions/api.mts`, `/api/*`) | Ücretsiz planda dahil |
| Veri | **Netlify Blobs** (anahtar-değer deposu, güçlü tutarlılık) | Ücretsiz planda dahil, ayrı veritabanı hesabı gerekmez |
| Fikstür motoru | `src/engine/` — saf TypeScript, arayüzden bağımsız | Tarayıcıda, sunucuda ve testlerde aynı kod |
| Testler | Vitest | 2–64 takım × tüm şablonlar uçtan uca simülasyon |
| Excel / görsel | `write-excel-file`, `html-to-image` (tarayıcıda, isteğe bağlı yüklenir) | Sunucu gerekmez |
| Yazı tipi | Barlow Condensed (pakete gömülü) | Dış servise istek yok |

**Güvenlik**
- Şifre kodda veya tarayıcıda değildir; Netlify ortam değişkeni `ADMIN_PASSWORD` olarak tanımlanır ve yalnızca sunucu fonksiyonu okur.
- Girişte imzalı, `HttpOnly` + `SameSite=Strict` + `Secure` oturum çerezi verilir (14 gün).
- 15 dakikada 10 hatalı denemeden sonra giriş geçici olarak kilitlenir.
- Taslak ve arşivlenmiş turnuvalar sunucu tarafında ziyaretçilere kapalıdır; güç puanları ziyaretçiye hiç gönderilmez.
- Aynı turnuva iki pencerede değiştirilirse sürüm kontrolü üzerine yazmayı engeller.

---

## Netlify’a yayınlama (deploy)

> ⚠️ Netlify’ın “sürükle-bırak” (Drop) yöntemi sunucu fonksiyonlarını yüklemez. Aşağıdaki **GitHub ile** yöntemini kullanın.

### 1. Kodu GitHub’a yükleyin
1. [github.com](https://github.com) üzerinde ücretsiz bir hesap açın ve **yeni, boş bir depo** (repository) oluşturun (ör. `turnuva-panosu`). Gizli (private) olabilir.
2. Bu klasörde bir terminal açıp şunları çalıştırın (depo adresini kendinizinkiyle değiştirin):
   ```bash
   git init
   git add .
   git commit -m "Turnuva Panosu"
   git branch -M main
   git remote add origin https://github.com/KULLANICI_ADINIZ/turnuva-panosu.git
   git push -u origin main
   ```
   (`.env` ve yerel test verisi `.gitignore` sayesinde yüklenmez.)

### 2. Netlify’da siteyi oluşturun
1. [app.netlify.com](https://app.netlify.com) adresinde ücretsiz hesap açın (GitHub ile giriş en kolayıdır).
2. **Add new site → Import an existing project → GitHub** ve deponuzu seçin.
3. Derleme ayarları `netlify.toml` dosyasından otomatik gelir (Build command: `npm run build`, Publish directory: `dist`). Değiştirmeyin.
4. **Deploy** düğmesine basmadan önce (veya hemen sonra) ortam değişkenlerini ekleyin:

### 3. Ortam değişkenleri (şifre)
**Site configuration → Environment variables → Add a variable**:

| Değişken | Zorunlu mu | Açıklama |
|---|---|---|
| `ADMIN_PASSWORD` | **Evet** | Yönetici şifresi. Uzun ve tahmin edilmesi zor bir şifre seçin. |
| `SESSION_SECRET` | Önerilir | Oturum çerezlerini imzalamak için uzun rastgele bir metin (ör. 40+ karakter). Verilmezse şifreden türetilir. |

Değişkenleri ekledikten sonra **Deploys → Trigger deploy → Deploy site** ile yeniden yayınlayın
(ortam değişkenleri fonksiyonlara yeni bir deploy ile yansır).

### 4. Kullanmaya başlayın
- Site adresiniz `https://SITE-ADI.netlify.app` olur. **Site configuration → Site details → Change site name** ile adı değiştirebilirsiniz.
- `https://SITE-ADI.netlify.app/yonetim` adresinden şifreyle giriş yapın.
- Yönetim sayfasındaki **Site ayarları** bölümünden site başlığını ve okul adını girin.

Veri deposu (Netlify Blobs) ilk kayıtta otomatik oluşur; ayrıca bir şey kurmanız gerekmez.
Sonraki kod güncellemeleri GitHub’a `git push` yapıldığında otomatik yayınlanır; **skor, kura, takım gibi veri değişiklikleri için deploy gerekmez.**

> Ücretsiz plan, okul ölçeğindeki kullanımın çok üzerinde kapasite sunar. Güncel limitler için Netlify’ın fiyatlandırma sayfasına bakabilirsiniz.

---

## Yönetici şifresini değiştirme

1. Netlify → **Site configuration → Environment variables** → `ADMIN_PASSWORD` değerini değiştirin.
2. **Deploys → Trigger deploy → Deploy site**.

`SESSION_SECRET` tanımlamadıysanız şifre değişince açık tüm oturumlar da kapanır.
`SESSION_SECRET` tanımladıysanız oturumları kapatmak için onu da değiştirin.

---

## Bilgisayarda çalıştırma (isteğe bağlı)

Gereken: [Node.js](https://nodejs.org) 20 veya üstü.

```bash
npm install
```

`.env.example` dosyasını `.env` adıyla kopyalayıp içindeki `ADMIN_PASSWORD` değerini değiştirin, sonra:

```bash
npm run dev
```

Tarayıcıda `http://localhost:5173` açılır. Yerelde veriler proje klasöründeki `.yerel-veri/` içinde dosya olarak tutulur
(canlıda Netlify Blobs kullanılır; yerel veri canlıya gönderilmez). Yerel sunucu, canlıdaki fonksiyonla **aynı API kodunu** çalıştırır.

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu (arayüz + API) |
| `npm test` | Fikstür motoru ve API testleri |
| `npm run build` | Tip denetimi + üretim derlemesi (`dist/`) |

---

## Öğretmen için kısa kullanım kılavuzu

1. Giriş yaptıktan sonra ana sayfada **+ Yeni turnuva** düğmesine basın. Sihirbaz sizi sırayla gezdirir; her adımda **Sonraki**’ye basarsınız:
   1. **Bilgiler:** ad, branş, öğretim yılı, isteğe bağlı kategori (Erkekler/Kızlar…) ve açıklama.
   2. **Takımlar:** her satıra bir takım adı yazıp “Ekle”ye basın. Sonra listede her takımın yanındaki **Güç puanı** kutusundan 1–10 arası bir puan seçin (10 en güçlü, 1 en zayıf). Oyuncu adları için takımın yanındaki “Düzenle”yi kullanın. Tüm takımlar aynı güçteyse sihirbaz bunu onaylamanızı ister.
   3. **Format:** bir şablon seçin; takım sayınıza uygun seçenekler listelenir. Ayarları değiştirebilirsiniz. Hatalı planla ilerlenemez; uyarılar varsa okuduğunuzu işaretlersiniz.
   4. **Puanlama:** branşa göre hazır gelen puanları ve eşitlik kriterlerini kontrol edip işaretleyin.
   5. **Özet:** her şeyi tek ekranda görün, gerekirse “Düzenle” ile ilgili adıma dönün ve **Turnuvayı oluştur**.
   Turnuva *Taslak* olarak oluşur ve kura ekranı açılır. Sonradan değişiklik için turnuvanın Takımlar / Format / Ayarlar sekmeleri kullanılır.
2. **Kura & Aşamalar**: “Güce göre dengeli” veya “Tamamen rastgele” seçip **Kura önizlemesi oluştur**. Gerekirse takımların yerini değiştirin.
   Projeksiyondaysanız **Canlı kura olarak göster** ile takımları tek tek çekin. Sonra **Kurayı kesinleştir**.
3. **Ayarlar → Devam ediyor**: turnuva herkese açılır. **Paylaş** düğmesiyle bağlantıyı öğrencilere gönderin.
4. **Maçlar**: maça dokunup skor, tarih, saat, saha girin. Tablolar ve ağaç anında güncellenir.
5. Aşamanın tüm maçları bitince **Kura & Aşamalar**’da üst tura çıkanları kontrol edip **Onayla**. Sonraki aşamanın kurasını çekin.
6. Son aşama bitince **Şampiyon** sekmesinde sistemin önerisini onaylayın; şampiyon arşive eklenir ve turnuva “Bitti” olur.
7. Dönem sonunda **Yönetim → Yedek → Tüm veriyi indir** ile yedek alın.

Bir hata mı yaptınız? **Geçmiş** sekmesinden önceki bir sürüme dönebilirsiniz.

---

## Yapılan varsayımlar

Kurulum sırasında soru sormamak için aşağıdaki makul varsayımlar yapıldı. Hepsi kodda tek bir yerde ve değiştirilebilir.

**Hesap ve görünürlük**
1. Tek yönetici, tek şifre; kullanıcı adı yok. Oturum 14 gün açık kalır.
2. **Güç puanları yalnızca yöneticiye görünür** (öğrencilerin sınıfları “zayıf” diye etiketlenmesin). Ziyaretçiler yalnızca seri başı numaralarını görür.
3. *Taslak* ve *arşivlenmiş* turnuvalar ziyaretçilere kapalıdır. Arşivlemek turnuvayı gizler, silmez; yönetim sayfasındaki “Arşiv” listesinden geri alınır. Şampiyon kaydı arşivlemeden etkilenmez.
4. Öğretim yılı Eylül’de başlar (Kasım 2026 → “2026-27”).

**Format ve kura**
5. Eleme aşaması her zaman son aşamadır; eleme maçları tek maçtır (çift maçlı eleme yok). Üçüncülük maçı isteğe bağlıdır.
6. Direkt elemede takım sayısı 2, 4, 8, 16, 32 veya 64 değilse en zayıf takımlar ön eleme oynar ve **ön eleme eleme ağacının içindedir**: kuranın tamamı en başta çekilir, ön eleme maçları ağacın en solunda görünür, kazanan ağaçta kendisini bekleyen yere geçer. (Ayrı “Ön eleme” aşaması yalnızca gruplardan veya ligden önce kullanılır; o durumda sonraki aşamanın kurası ön eleme bitince çekilir.)
7. Eleme kurası varsayılan olarak **kademeli**dir: en güçlü iki takım ağacın ayrı yarılarına (ancak finalde karşılaşabilirler), ilk 4 ayrı çeyreklere, ilk 8 ayrı sekizde birlere kurayla dağıtılır; ana tablonun ilk turunda güçlü yarıdaki her takımın rakibi zayıf yarıdan kurayla gelir. Ön elemeyi en zayıflar oynar; ön elemecilerin güçlü yarısı zayıf yarıdan kurayla rakip alır. Format’ta **“Kesin güç sıralaması”** açılırsa kura şanssız olur: 1. ile sonuncu, 2. ile sondan bir önceki eşleşir ve ön elemede galip, eşleşmedeki güçlü takımın sırasını alır (17 takımda ön eleme galibi 1. sıradaki takımla oynar).
8. Grup kurasında takımlar güce göre sıralanıp grup sayısı kadar takımdan oluşan torbalara ayrılır; her torbadan her gruba bir takım düşer. Son torba eksikse fazladan takım alacak gruplar kurayla belirlenir.
9. “Tamamen rastgele” kurada güç puanları hiç kullanılmaz.
10. Çapraz eşleşme (A1-B2, C1-D2 | B1-A2, D1-C2) çift sayıda grup ve gruptan 1-2 takım çıkışı gerektirir; uymazsa sıralı eşleşmeye (1.ler en zayıf 2.ler/3.lerle) geçilir ve uyarılır. Aynı gruptan çıkanlar yalnızca **ilk turda** ayrılır.
11. Gruplardan sonra eleme kurasında “dengeli” mod, aşamadaki tur atlama kuralını uygular; “rastgele” mod eşleşmeleri karıştırır (aynı grup kuralı yine uygulanır).
12. Lig/grup fikstürü daire (Berger) yöntemiyle kurulur; tek sayıda takımda her turda bir takım maç yapmaz (bay). Rövanşlı ligde ikinci yarı, ilk yarının ev/deplasman çevrilmiş hâlidir.

**Puanlama ve sıralama**
13. Branşa göre hazır puanlama (Ayarlar’dan değiştirilebilir):
    - Futbol: 3-1-0, beraberlik var, hükmen 3-0 (birim: gol)
    - Voleybol: 3-0, beraberlik yok, 3-2 / 2-1 galibiyette 2-1 puan, hükmen 3-0 (birim: set)
    - Basketbol: galibiyet 2, mağlubiyet 1, hükmen mağlubiyet 0, hükmen 20-0 (birim: sayı)
    - Badminton / Masa tenisi: galibiyet 2, mağlubiyet 0, beraberlik yok, hükmen 2-0 (birim: set)
    - Hentbol: 3-1-0, hükmen 10-0 · Diğer: 3-1-0
14. Varsayılan sıralama: Puan → ikili maç puanı → ikili maç averajı → ikili maçta atılan → genel averaj → atılan. İkili maç kriterleri yalnızca eşit takımlar arasındaki maçlara bakar ve eşitlik bölündükçe kalan takımlara yeniden uygulanır.
15. En iyi X.’ler (ör. en iyi üçüncüler) puan → averaj → atılan → galibiyetle sıralanır; gruplar farklı büyüklükteyse son sıradaki takımlara karşı maçlar sayılmaz.
16. Kriterlerle ayrılamayan eşitlikte sistem karar vermez; yönetici sıralamayı belirler (kura, fair-play vb. kararı ona aittir).

**Takım değişiklikleri**
17. “Yerine takım koy”: yeni takım ayrılan takımın yerini, oynanmış maçlarını ve puanlarını devralır; eski ad “önceki” olarak saklanır.
18. “Turnuvadan çekildi”: takımın oynanmamış maçları hükmen kaybedilir.
19. Kurası çekilmiş aşamalara sonradan takım eklenmez (sonraki aşamalar etkilenmez).

**Veri güvenliği**
20. Her kayıt bir sürüm olarak saklanır (turnuva başına son 40). Yeniden kura ve skor silen değişiklikler onay ister; ayrıca geçmişten geri alınabilir.
21. Yedekten geri yükleme, aynı kimlikteki turnuvaların güncel hâlini değiştirir (önceki hâl geçmişte kalır); şampiyon kayıtlarını mevcutlara ekler.

---

## Karar bekleyen konu: branşa özel istatistikler

Talebin sonunda belirttiğiniz gibi, branşa göre oyuncu istatistikleri (ör. futbolda **gol atan oyuncular / gol krallığı**, basketbolda sayı, voleybolda set ayrıntıları) **henüz yok**; bunu birlikte karar vermek üzere bıraktım.
Altyapı buna hazır: takımların oyuncu listesi tutuluyor ve her maçın bir “not” alanı var. Karar verilmesi gerekenler:

- Hangi branşlarda hangi istatistik tutulacak (gol, asist, sarı/kırmızı kart, sayı, set skorları…)?
- Oyuncu adları herkese açık mı görünecek (öğrenci mahremiyeti)?
- Gol krallığı gibi sıralamalar ana sayfada mı, turnuva sayfasında mı gösterilecek?

---

## Testler

```bash
npm test
```

- **Matris testi** (`tests/fixture-matrix.test.ts`): 2–64 arasındaki **her takım sayısı** için 4 şablonun önerdiği **tüm seçenekler**, hem dengeli hem rastgele kurayla baştan sona oynatılır (rastgele skorlar, beraberlikler, penaltılar, hükmen sonuçlar, yönetici eşitlik kararları). Her adımda denetlenenler:
  - Her takım tam bir kez yerleşiyor (grup, ağaç veya ön eleme); bay sayısı doğru.
  - Hiçbir takım aynı turda iki kez oynamıyor.
  - Rövanşlı liglerde iki takım aynı turda eşleşmiyor; her çift tam olarak 1 veya 2 kez karşılaşıyor.
  - Puan durumunda takım tekrarı yok; oynanan maç sayıları tutarlı.
  - Dengeli grup kurasında her grupta her torbadan en fazla bir takım var.
  - Ön elemeyi en zayıflar oynuyor; maç sayısı = takım sayısı − hedef.
  - Üst tura çıkan sayısı plana uyuyor; sonunda tek bir şampiyon çıkıyor.
- **Birim testleri** (`tests/engine-unit.test.ts`): 17 ve 20 takım ön eleme örnekleri (önizleme metni dahil), seri başı (favoriler kazanırsa finalde 1-2, yarı finalde ilk 4), çapraz eşleşme, en iyi üçüncüler, ikili maç kriterleri, voleybol puanlaması, hükmen, eşitlik kararı, grup takasında skor koruma, oynanmış maç uyarıları, planlayıcı önerileri.
- **API testleri** (`tests/api.test.ts`): giriş, yetki, taslak gizliliği, güç puanı gizliliği, sürüm çakışması, geçmişten geri yükleme, arşiv, şampiyonlar, yedek alma/yükleme.

---

## Proje yapısı

```
src/engine/        Fikstür motoru (saf TypeScript)
  types.ts           Veri modeli
  draw.ts            Kura: torbalar, seri başı, ön eleme, çapraz eşleşme, önizleme özeti
  roundRobin.ts      Lig fikstürü (Berger)
  standings.ts       Puan durumu ve eşitlik kriterleri
  qualify.ts         Aşama sonucu, en iyi X.’ler, şampiyon önerisi
  planner.ts         Şablonlar, plan doğrulama, geçerli seçenek önerileri
  tournament.ts      Skor girişi, eşleşme değiştirme, takım işlemleri, etki analizi
src/ui/            Arayüz (React)
server/            API (Netlify Function ve yerel geliştirme ortak kodu)
netlify/functions/ Netlify Function giriş noktası (Blobs bağlantısı)
tests/             Vitest testleri
netlify.toml       Netlify derleme ve yönlendirme ayarları
```
