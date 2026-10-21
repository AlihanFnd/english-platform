/**
 * Herkese açık gizlilik politikası / KVKK aydınlatma metni.
 *
 * Giriş GEREKTİRMEZ — Apple/Google mağaza incelemesi ve ziyaretçiler
 * bu sayfayı oturum açmadan görebilmeli. "/gizlilik" sayfasıyla
 * KARIŞTIRILMAMALI: o, oturum açmış kullanıcının kendi verisini
 * indirip hesabını sildiği ayrı bir ekrandır.
 */

export const metadata = {
  title: 'Gizlilik Politikası — Readixo',
};

export default function GizlilikPolitikasiSayfasi() {
  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-6 text-on-surface">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Gizlilik Politikası ve KVKK Aydınlatma Metni</h1>
        <p className="text-sm text-on-surface-variant">Son güncelleme: 21 Ekim 2026</p>
      </header>

      <p className="text-sm leading-relaxed">
        Bu metin, Readixo (uygulama içi ve teknik altyapıda &quot;Linguza&quot; adıyla da
        anılır) uygulamasını kullanırken hangi kişisel verilerinizin, hangi amaçla,
        ne kadar süreyle işlendiğini ve haklarınızı açıklar. 6698 sayılı Kişisel
        Verilerin Korunması Kanunu (&quot;KVKK&quot;) kapsamında veri sorumlusu, uygulamanın
        geliştiricisidir; iletişim bilgisi bu metnin sonundadır.
      </p>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">1. Hangi verilerinizi topluyoruz?</h2>
        <div className="overflow-x-auto rounded-xl border border-outline-variant">
          <table className="w-full text-sm">
            <thead className="bg-surface-variant/40 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Veri kategorisi</th>
                <th className="px-4 py-2 font-medium">Örnek</th>
                <th className="px-4 py-2 font-medium">Neden topluyoruz</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-outline-variant/50">
                <td className="px-4 py-2 font-medium">Kimlik bilgisi</td>
                <td className="px-4 py-2 text-on-surface-variant">E-posta, kullanıcı adı, rol</td>
                <td className="px-4 py-2 text-on-surface-variant">Hesap oluşturma, giriş, hesap kurtarma</td>
              </tr>
              <tr className="border-t border-outline-variant/50">
                <td className="px-4 py-2 font-medium">Kimlik doğrulama sırrı</td>
                <td className="px-4 py-2 text-on-surface-variant">Şifrenizin geri döndürülemez özeti (hash)</td>
                <td className="px-4 py-2 text-on-surface-variant">Giriş doğrulaması — gerçek şifreniz hiçbir yerde saklanmaz</td>
              </tr>
              <tr className="border-t border-outline-variant/50">
                <td className="px-4 py-2 font-medium">Öğrenme / davranış verisi</td>
                <td className="px-4 py-2 text-on-surface-variant">
                  Okuma ilerlemesi, kelime listeniz, cümleleriniz, quiz sonuçları,
                  günlük seri / hedef (XP)
                </td>
                <td className="px-4 py-2 text-on-surface-variant">
                  Kaldığınız yerden devam, kişiselleştirilmiş tekrar, ilerleme takibi
                </td>
              </tr>
              <tr className="border-t border-outline-variant/50">
                <td className="px-4 py-2 font-medium">Taranan / girilen metin</td>
                <td className="px-4 py-2 text-on-surface-variant">
                  Metin Tara (OCR) ile yapıştırdığınız metinler, geri bildirim mesajı
                </td>
                <td className="px-4 py-2 text-on-surface-variant">
                  Taradığınız metne tekrar erişebilmeniz, ürünü geliştirmek
                </td>
              </tr>
              <tr className="border-t border-outline-variant/50">
                <td className="px-4 py-2 font-medium">Teknik / analitik veri</td>
                <td className="px-4 py-2 text-on-surface-variant">
                  Uygulama içi etkinlik günlüğü (ne zaman, ne kadar süre), saat dilimi
                </td>
                <td className="px-4 py-2 text-on-surface-variant">
                  Hatalı kullanım tespiti, hız sınırlama, günün başlangıcını hesaplama
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-on-surface-variant">
          Kayıtlı kullanıcıysanız bu listenin tablo/kolon düzeyindeki tam, güncel
          hâlini ve saklama sürelerini uygulama içinde{' '}
          <span className="font-mono">Hesabım → Verilerim</span> ekranından görebilirsiniz.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">2. Verilerinizi ne kadar süre saklıyoruz?</h2>
        <ul className="list-disc list-inside text-sm space-y-1 text-on-surface-variant">
          <li>Hesap ve öğrenme verileriniz, siz hesabınızı silene kadar saklanır.</li>
          <li>Etkinlik günlükleri (analitik) en fazla 90 gün sonra otomatik silinir.</li>
          <li>Taranan metinler (OCR) en fazla 365 gün sonra otomatik silinir; istediğiniz zaman tek tek de silebilirsiniz.</li>
          <li>Şifre sıfırlama bağlantıları en fazla 7 gün içinde geçersiz olur ve silinir.</li>
          <li>Şifrenizin hash&apos;i hiçbir dışa aktarma dosyasına dahil edilmez.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">3. Verileriniz kiminle paylaşılıyor?</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Verileriniz pazarlama amacıyla satılmaz veya üçüncü taraflarla paylaşılmaz.
          Hizmeti çalıştırabilmek için sınırlı sayıda alt yüklenici kullanılır:
        </p>
        <ul className="list-disc list-inside text-sm space-y-1 text-on-surface-variant">
          <li>Barındırma: sunucu (Render) ve web arayüzü (Vercel) altyapı sağlayıcıları.</li>
          <li>Çeviri/metin analizi: girdiğiniz kelime veya cümleler, çeviri üretmek için Groq API&apos;sine gönderilir.</li>
          <li>E-posta: şifre sıfırlama bağlantıları Resend üzerinden gönderilir.</li>
        </ul>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Bu sağlayıcılar veriyi yalnızca bizim adımıza, belirtilen amaç için işler.
          Yasal bir zorunluluk olmadıkça verileriniz başka hiçbir kurumla paylaşılmaz.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">4. Haklarınız</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          KVKK madde 11 ve ilgili mevzuat kapsamında; verilerinizin işlenip
          işlenmediğini öğrenme, işlenmişse bilgi talep etme, verinizi indirme,
          düzeltilmesini/silinmesini isteme ve itiraz etme haklarına sahipsiniz.
          Hesabınız varsa verilerinizi{' '}
          <span className="font-mono">Hesabım → Verilerim</span> ekranından
          tek tıkla indirebilir veya hesabınızı kalıcı olarak silebilirsiniz.
          Diğer talepleriniz için aşağıdaki e-postayla bize ulaşabilirsiniz.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">5. Çerezler</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Web uygulaması, oturumunuzu sürdürmek için yalnızca teknik olarak zorunlu
          bir oturum çerezi kullanır (HttpOnly — JavaScript ile okunamaz). Reklam
          veya izleme amaçlı üçüncü taraf çerezi kullanılmaz.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">6. Değişiklikler</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Bu politika güncellenebilir; önemli değişikliklerde uygulama içinden
          bilgilendirme yapılır. Güncel sürüm her zaman bu sayfadadır.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">7. İletişim</h2>
        <p className="text-sm text-on-surface-variant">
          Sorularınız için:{' '}
          <a href="mailto:alihanfnd35@gmail.com" className="text-primary underline">
            alihanfnd35@gmail.com
          </a>
        </p>
      </section>
    </div>
  );
}
