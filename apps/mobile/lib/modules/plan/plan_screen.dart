import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/format/fmt.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/states.dart';
import '../../data/billing_api.dart';
import '../../models/billing.dart';
import '../../models/me.dart';

/// Every feature with its label (packages/features FEATURE_LABELS), in the web's order.
const kFeatureLabels = [
  ('core_sales', 'Sales and bills'),
  ('expenses', 'Expenses'),
  ('daily_sheet', 'Daily sheet'),
  ('customers_crm', 'Customers'),
  ('ratings', 'Ratings and reviews'),
  ('reports_advanced', 'Monthly and yearly reports'),
  ('excel_export', 'Excel export'),
  ('push', 'Push notifications'),
  ('announcements', 'Team announcements'),
  ('ledger', 'Ledger and payouts'),
  ('audit_log', 'Audit log'),
  ('whatsapp', 'WhatsApp bills and reminders'),
  ('whatsapp_campaigns', 'WhatsApp campaigns'),
  ('public_services_api', 'Price list for your website'),
  ('mcp_api', 'AI connect (Claude and MCP)'),
];
const kOverrideOnly = {'mcp_api'};
const _planNames = {'free': 'Free', 'pro': 'Pro', 'pro_max': 'Pro Max'};

Future<void> _openBrowser(String url) async {
  await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
}

/// The salon's plan: what it includes, the other plans, and card billing (Stripe opens in the browser).
class PlanScreen extends StatefulWidget {
  const PlanScreen({super.key, required this.me, required this.api, required this.onChanged, this.open = _openBrowser});
  final Me me;
  final BillingApi api;

  /// Re-reads /api/me (after a plan change).
  final Future<void> Function() onChanged;
  final Future<void> Function(String url) open;

  @override
  State<PlanScreen> createState() => _PlanScreenState();
}

class _PlanScreenState extends State<PlanScreen> {
  Billing? _b;
  Object? _error;
  String? _opening;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final b = await widget.api.get();
      if (mounted) {
        setState(() {
          _b = b;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _toast(String s) => ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(s)));

  Future<void> _go(String id, Future<String> Function() call) async {
    setState(() => _opening = id);
    try {
      await widget.open(await call());
    } catch (e) {
      _toast(messageOf(e));
    } finally {
      if (mounted) setState(() => _opening = null);
    }
  }

  Future<void> _free() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Switch to Free?'),
        content: const Text('Free is yours to keep: sales, bills, expenses and the daily sheet. Other features are locked (nothing is deleted) and up to 2 staff stay active.'),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Switch to Free'))],
      ),
    );
    if (ok != true) return;
    try {
      await widget.api.free();
      _toast("You're on Free");
      await widget.onChanged();
      _load();
    } catch (e) {
      _toast(messageOf(e));
    }
  }

  String? get _banner {
    final s = widget.me.subscription;
    int daysTo(int? ms) => ms == null ? 0 : (DateTime.fromMillisecondsSinceEpoch(ms).difference(DateTime.now()).inHours / 24).ceil().clamp(0, 9999);
    String d(int n) => '$n day${n == 1 ? '' : 's'}';
    if (s.status == 'trial') return '${d(daysTo(s.trialEndsAt))} left in your free trial';
    if (s.status == 'grace' || s.status == 'past_due') return 'Your trial has ended — upgrade within ${d(daysTo(s.graceEndsAt))} to keep using everything';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final b = _b;
    final current = me.org.planId;
    final owner = me.user.role == 'owner';
    final banner = _banner;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        Text('Plan', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
        Text("You're on ${_planNames[current] ?? current}${banner == null ? '' : ' · $banner'}"),
        const SizedBox(height: 12),
        if (_error != null && b == null)
          ErrorState(error: _error!, onRetry: _load)
        else if (b == null)
          const SkSkeleton(height: 200, radius: 24)
        else ...[
          if (b.paysByCard || b.canManage)
            SkGlass(
              blur: false,
              child: Row(children: [
                Expanded(
                  child: Text(b.paysByCard
                      ? 'Paid by card${b.periodEnd == null ? '' : ' · ${b.cancelAt != null ? 'ends' : 'renews'} ${me.fmt.dateLabel(DateTime.fromMillisecondsSinceEpoch(b.cancelAt ?? b.periodEnd!).toIso8601String().substring(0, 10))}'}${b.stripeStatus == 'past_due' ? ' · the last payment failed, please update your card' : ''}'
                      : 'Card details and invoices'),
                ),
                OutlinedButton(onPressed: _opening != null ? null : () => _go('portal', widget.api.portal), child: const Text('Manage billing')),
              ]),
            ),
          const SizedBox(height: 12),
          SkGlass(
            blur: false,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Included in your plan', style: t.titleMedium),
              const SizedBox(height: 6),
              Text('Staff: ${me.maxStaff == null ? 'unlimited' : 'up to ${me.maxStaff}'}'),
              const SizedBox(height: 6),
              for (final (key, label) in kFeatureLabels)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(children: [
                    Icon(me.features.contains(key) ? Icons.check_rounded : Icons.lock_outline_rounded, size: 18, color: me.features.contains(key) ? cs.primary : cs.onSurfaceVariant),
                    const SizedBox(width: 8),
                    Expanded(child: Text(kOverrideOnly.contains(key) ? '$label (on request)' : label)),
                  ]),
                ),
            ]),
          ),
          const SizedBox(height: 12),
          for (final p in b.plans)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SkGlass(
                blur: false,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(p.name, style: t.titleMedium)),
                    if (p.id == current) Chip(label: Text(me.subscription.status == 'trial' ? 'Your trial' : 'Current'), visualDensity: VisualDensity.compact),
                  ]),
                  Text(p.priceMonthly == 0 ? 'Free' : '${p.currency} ${p.priceMonthly} / month', style: t.titleSmall),
                  if (p.id != current && !b.paysByCard && p.canCheckout && p.priceMonthly > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: FilledButton(onPressed: _opening != null ? null : () => _go(p.id, () => widget.api.checkout(p.id)), child: Text(_opening == p.id ? 'Opening…' : 'Choose ${p.name}')),
                    ),
                  if (p.id != current && p.priceMonthly == 0 && owner && b.enabled)
                    Padding(padding: const EdgeInsets.only(top: 8), child: OutlinedButton(onPressed: _free, child: const Text('Stay on Free'))),
                ]),
              ),
            ),
          if (!b.enabled) Text('To change your plan, contact us. Other plans can be agreed with our team.', style: t.bodySmall),
        ],
      ]),
    );
  }
}
