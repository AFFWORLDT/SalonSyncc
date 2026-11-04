import '../../models/sale.dart';
import '../../models/settings.dart';
import '../config.dart';
import '../format/fmt.dart';

/// The texts and links for sharing a bill, exactly as the web builds them (apps/web/src/components/app/bill.tsx).
class BillShare {
  const BillShare({required this.slug, required this.settings, required this.fmt});
  final String slug;
  final SalonSettings settings;
  final Fmt fmt;

  /// The public receipt: anyone with the link can open it, no sign-in (the token is random per bill).
  String receiptUrl(Sale s) => salonBase(slug).replace(path: '/r/', queryParameters: {'t': s.token}).toString();

  /// The salon's thank-you message with {name} {amount} {salon} {barber} {link} filled in. A walk-in ("Customer 3")
  /// gets no name; doubled spaces and spaces before punctuation are tidied away.
  String thankYouText(Sale s) {
    final vars = {
      'name': s.isWalkIn ? '' : s.customerLabel,
      'amount': fmt.money(s.amount),
      'salon': settings.displayName,
      'barber': s.barberName,
      'link': receiptUrl(s),
    };
    return settings.thankYouText
        .replaceAllMapped(RegExp(r'\{(\w+)\}'), (m) => vars[m[1]] ?? m[0]!)
        .replaceAll(RegExp(r'\s{2,}'), ' ')
        .replaceAllMapped(RegExp(r'\s+([,.!?])'), (m) => m[1]!)
        .trim();
  }

  String billLine(Sale s) => '${settings.displayName} bill ${s.billNo} · ${fmt.money(s.amount)}\n${receiptUrl(s)}';

  /// The customer's WhatsApp chat with the thank-you text; with no number, WhatsApp asks which chat (bill line).
  String whatsAppLink(Sale s) {
    final phone = s.customerPhone;
    final thanks = thankYouText(s);
    final text = phone != null && thanks.isNotEmpty ? thanks : billLine(s);
    final to = phone == null ? '' : _digits(phone);
    return 'https://wa.me/$to?text=${Uri.encodeComponent(text)}';
  }

  String _digits(String phone) => phone.startsWith('+') ? phone.substring(1) : '${settings.phoneCountry}${phone.replaceFirst(RegExp(r'^0'), '')}';

  String shareTitle(Sale s) => settings.displayName.isEmpty ? 'Bill ${s.billNo}' : 'Bill ${s.billNo} — ${settings.displayName}';
  String shareText(Sale s) => '${shareTitle(s)} · ${fmt.money(s.amount)}\n${receiptUrl(s)}';
}
