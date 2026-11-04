import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/config.dart';

void main() {
  test('normalizes like the server', () {
    expect(normalizeSlug(' Super Salon '), 'super-salon');
    expect(normalizeSlug('super_salon'), 'super-salon');
    expect(normalizeSlug('SUPERSALON'), 'supersalon');
  });

  test('rejects 1-char and 31-char slugs', () {
    expect(isValidSlug('a'), isFalse);
    expect(isValidSlug('a' * 31), isFalse);
    expect(isValidSlug('-abc'), isFalse);
    expect(isValidSlug('supersalon'), isTrue);
    expect(isValidSlug('a' * 30), isTrue);
  });

  test('salonBase builds https host', () {
    expect(salonBase('supersalon').toString(), 'https://supersalon.salonkit.online');
    expect(configBase().toString(), 'https://admin.salonkit.online');
  });

  test('absolute keeps query', () {
    expect(absolute(Uri.parse('https://supersalon.salonkit.online'), '/api/public/logo/3?org=supersalon').toString(),
        'https://supersalon.salonkit.online/api/public/logo/3?org=supersalon');
    expect(absolute(Uri.parse('https://x.y'), 'https://cdn.example/a.png').toString(), 'https://cdn.example/a.png');
  });
}
