import 'json.dart';

class PlanOffer {
  const PlanOffer({required this.id, required this.name, required this.priceMonthly, required this.currency, required this.canCheckout});
  final String id, name, currency;

  /// Major units per month (0 = Free).
  final num priceMonthly;
  final bool canCheckout;
}

/// GET /api/billing: how the salon pays and which plans it can pick.
class Billing {
  const Billing({required this.enabled, required this.provider, this.stripeStatus, this.periodEnd, this.cancelAt, required this.canManage, required this.plans});
  final bool enabled, canManage;
  final String provider;
  final String? stripeStatus;
  final int? periodEnd, cancelAt;
  final List<PlanOffer> plans;

  /// A live card subscription (as the web and server count it); a cancelled one can subscribe again.
  bool get paysByCard => provider == 'stripe' && const {'active', 'trialing', 'past_due', 'unpaid'}.contains(stripeStatus);

  factory Billing.fromJson(Map<String, dynamic> j) {
    final p = j['plans'];
    int? ms(Object? v) => v is int ? v : null;
    return Billing(
      enabled: j['enabled'] == true,
      provider: strOrNull(j, 'provider') ?? 'none',
      stripeStatus: strOrNull(j, 'stripe_status'),
      periodEnd: ms(j['current_period_end']),
      cancelAt: ms(j['cancel_at']),
      canManage: j['can_manage'] == true,
      plans: [
        for (final x in p is List ? p : const [])
          PlanOffer(
            id: str(obj(x, 'plan'), 'id'),
            name: str(obj(x, 'plan'), 'name'),
            priceMonthly: numOrNull(obj(x, 'plan'), 'price_monthly') ?? 0,
            currency: strOrNull(obj(x, 'plan'), 'currency') ?? '',
            canCheckout: (x as Map)['can_checkout'] == true,
          ),
      ],
    );
  }
}
