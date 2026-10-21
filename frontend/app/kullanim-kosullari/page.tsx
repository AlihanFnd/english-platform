/**
 * Herkese açık kullanım koşulları.
 *
 * Giriş GEREKTİRMEZ — mağaza incelemesi ve ziyaretçiler oturum açmadan
 * görebilmeli.
 */

export const metadata = {
  title: 'Kullanım Koşulları — Readixo',
};

export default function KullanimKosullariSayfasi() {
  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-6 text-on-surface">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Kullanım Koşulları</h1>
        <p className="text-sm text-on-surface-variant">Son güncelleme: 21 Ekim 2026</p>
      </header>

      <p className="text-sm leading-relaxed">
        Readixo (teknik altyapıda &quot;Linguza&quot; adıyla da anılır) uygulamasını
        veya web sitesini kullanarak aşağıdaki koşulları kabul etmiş olursunuz.
        Lütfen dikkatlice okuyun.
      </p>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">1. Hizmetin tanımı</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Readixo; İngilizce metin okuma, anlık çeviri, kelime/cümle çalışması ve
          ilerleme takibi sunan bir eğitim uygulamasıdır. Çeviriler ve metin
          analizleri yapay zekâ (otomatik dil modeli) ile üretilir; %100 doğruluk
          garanti edilmez, eğitim amaçlı bir yardımcı araç olarak sunulur.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">2. Hesap oluşturma ve sorumluluğunuz</h2>
        <ul className="list-disc list-inside text-sm space-y-1 text-on-surface-variant">
          <li>Kayıt olurken verdiğiniz bilgilerin doğru olduğunu beyan edersiniz.</li>
          <li>Şifrenizin gizliliğinden ve hesabınızda gerçekleşen işlemlerden siz sorumlusunuz.</li>
          <li>
            13 yaşından küçükseniz, bu uygulamayı yalnızca bir ebeveyn veya
            yasal vasinizin onayı ve gözetimiyle kullanabilirsiniz.
          </li>
          <li>Hesabınızı başka bir kişiye devredemez veya sattıramazsınız.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">3. Kabul edilemez kullanım</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Uygulamayı yasa dışı amaçla kullanamaz, başka kullanıcıları taciz
          edemez, sistemi kötüye kullanamaz (ör. otomatik bot ile aşırı istek
          göndermek, güvenlik açıklarını istismar etmeye çalışmak) veya
          başkasının hesabına izinsiz erişmeye çalışamazsınız. Bu kurallara
          aykırı kullanımda hesabınızı askıya alma veya kapatma hakkımız
          saklıdır.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">4. İçerik ve fikri mülkiyet</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Uygulamadaki kitaplar, arayüz tasarımı ve yazılım Readixo&apos;ya veya
          ilgili hak sahiplerine aittir; izinsiz kopyalanamaz veya ticari amaçla
          yeniden dağıtılamaz. Kelime listeniz, cümleleriniz ve geri
          bildirimleriniz gibi kendi oluşturduğunuz içerik size aittir; bunları
          hizmeti size sunabilmemiz için kullanmamıza izin vermiş olursunuz.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">5. Ücretlendirme</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Uygulamanın temel özellikleri şu anda ücretsizdir. İleride sunulabilecek
          ücretli özellikler veya abonelikler, satın alma öncesinde uygulama
          içinde açıkça fiyatı ve kapsamıyla belirtilir; önceden haber
          vermeden mevcut ücretsiz özellikler ücretli hâle getirilmez.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">6. Hizmetin sunumu ve sorumluluk sınırı</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Hizmet &quot;olduğu gibi&quot; sunulur. Kesintisiz veya hatasız çalışacağını
          garanti etmeyiz; bakım, güncelleme veya teknik bir sorun nedeniyle
          hizmette geçici kesintiler olabilir. Yasaların izin verdiği azami
          ölçüde, hizmetin kullanımından doğabilecek dolaylı zararlardan
          sorumlu tutulamayız.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">7. Hesap silme</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Hesabınızı dilediğiniz zaman, uygulama içinden{' '}
          <span className="font-mono">Hesabım → Hesabımı Sil</span> yoluyla
          kalıcı olarak silebilirsiniz. Silme işlemi geri alınamaz.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">8. Değişiklikler</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Bu koşulları güncelleyebiliriz. Önemli değişikliklerde uygulama
          içinden bilgilendirme yaparız. Güncel sürüm her zaman bu sayfadadır.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">9. Uygulanacak hukuk</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Bu koşullar Türkiye Cumhuriyeti yasalarına tabidir.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">10. İletişim</h2>
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
