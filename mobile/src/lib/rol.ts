/**
 * YH-09: Türkçe Rol Etiketleri.
 * Kullanıcı rollerini (student, teacher, admin) Türkçe kullanıcı dostu terimlere dönüştürür.
 */
export function rolEtiketi(role?: string): string {
  switch (role) {
    case 'admin':
      return 'Yönetici';
    case 'teacher':
      return 'Öğretmen';
    default:
      return 'Öğrenci';
  }
}
