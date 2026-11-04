import 'json.dart';

/// The parts of the salon's settings (from GET /api/me) that the app's screens use.
class SalonSettings {
  const SalonSettings({
    required this.currency,
    required this.currencyMinor,
    required this.locale,
    required this.timezone,
    required this.displayName,
    required this.phoneCountry,
    required this.vatEnabled,
    required this.vatRate,
    required this.quickAmounts,
    required this.thankYouText,
    this.receiptFooter,
    this.logoUrl,
    this.address,
    this.phone,
    this.trn,
    required this.waReady,
  });

  final String currency, locale, timezone, displayName, phoneCountry, thankYouText;
  final int currencyMinor;
  final bool vatEnabled, waReady;
  final num vatRate;

  /// Shortcut amounts for a bill, in major units.
  final List<num> quickAmounts;
  final String? receiptFooter, logoUrl, address, phone, trn;

  factory SalonSettings.fromJson(Map<String, dynamic> j) {
    final q = j['quick_amounts'];
    final minor = j['currency_minor'];
    return SalonSettings(
      currency: strOrNull(j, 'currency') ?? '',
      currencyMinor: minor is int && minor > 0 ? minor : 100,
      locale: strOrNull(j, 'locale') ?? 'en-GB',
      timezone: strOrNull(j, 'timezone') ?? 'UTC',
      displayName: strOrNull(j, 'display_name') ?? '',
      phoneCountry: strOrNull(j, 'phone_country') ?? '',
      vatEnabled: j['vat_enabled'] == true,
      vatRate: numOrNull(j, 'vat_rate') ?? 0,
      quickAmounts: q is List ? q.whereType<num>().toList() : const [],
      thankYouText: strOrNull(j, 'thank_you_text') ?? '',
      receiptFooter: strOrNull(j, 'receipt_footer'),
      logoUrl: strOrNull(j, 'logo_url'),
      address: strOrNull(j, 'address'),
      phone: strOrNull(j, 'phone'),
      trn: strOrNull(j, 'trn'),
      waReady: j['wa_ready'] == true,
    );
  }
}
