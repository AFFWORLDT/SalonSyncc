import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/share/bill_share.dart';
import '../../core/ui/motion.dart';
import '../../core/ui/page_header.dart';
import '../../models/sale.dart';
import '../../models/settings.dart';
import 'bill_view.dart';

/// "Congrats! Bill generated": a success banner, the bill itself (as the customer gets it), sharing (when given),
/// and Done / New sale pinned at the bottom.
class SaleDone extends StatelessWidget {
  const SaleDone({super.key, required this.sale, required this.fmt, required this.settings, this.slug, this.onFillDetails, this.actions, required this.onDone, required this.onNew});
  final Sale sale;
  final Fmt fmt;
  final SalonSettings settings;
  final String? slug;
  final VoidCallback? onFillDetails;
  final Widget? actions;
  final VoidCallback onDone, onNew;

  @override
  Widget build(BuildContext context) {
    final slug = this.slug;
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          SkPageHeader(
            title: 'Bill Details',
            onBack: onDone,
            actions: [
              if (slug != null)
                SkPillAction(
                  icon: Icons.ios_share_rounded,
                  label: 'Share',
                  onTap: () {
                    final b = BillShare(slug: slug, settings: settings, fmt: fmt);
                    Share.share(b.shareText(sale), subject: b.shareTitle(sale));
                  },
                ),
            ],
          ),
          Expanded(
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
              _Congrats(sale: sale, fmt: fmt),
              const SizedBox(height: 16),
              // The bill itself stays exactly as the customer gets it (paper look).
              BillView(sale: sale, settings: settings, fmt: fmt, slug: slug, onFillDetails: onFillDetails),
              if (actions != null) ...[const SizedBox(height: 16), actions!],
            ]),
          ),
        ]),
      ),
      // Always on screen, however tall the bill and sharing get.
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Row(children: [
            Expanded(child: _DoneButton(onPressed: onDone)),
            const SizedBox(width: 12),
            Expanded(child: _NewSaleButton(onPressed: onNew)),
          ]),
        ),
      ),
    );
  }
}

const _deep = Color(0xFF0E5A48), _deeper = Color(0xFF0A3E32), _gold = Color(0xFFD9A14E);

/// "Congrats! Bill generated": a deep green tick that pops in, the bill number, amount and payment, and confetti.
class _Congrats extends StatelessWidget {
  const _Congrats({required this.sale, required this.fmt});
  final Sale sale;
  final Fmt fmt;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: LinearGradient(colors: dark ? [cs.primary.withValues(alpha: 0.14), cs.primary.withValues(alpha: 0.24)] : const [Color(0xFFEAF5EE), Color(0xFFDDEFE4)]),
        border: Border.all(color: dark ? cs.primary.withValues(alpha: 0.3) : const Color(0xFFCFE6D7)),
      ),
      child: Row(children: [
        TweenAnimationBuilder<double>(
          tween: Tween(begin: 0.5, end: 1),
          duration: skDuration(context, 420),
          curve: Curves.elasticOut,
          builder: (_, v, child) => Transform.scale(scale: v, child: child),
          child: Container(
            width: 52,
            height: 52,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [_deep, _deeper]),
              boxShadow: [BoxShadow(color: Color(0x400A3E32), blurRadius: 10, offset: Offset(0, 4))],
            ),
            child: const Icon(Icons.check_rounded, size: 30, color: Colors.white),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Congrats! Bill generated', style: t.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 3),
            Wrap(spacing: 6, children: [
              Text(sale.billNo, style: SkText.mono.copyWith(fontSize: 12.5, color: cs.onSurfaceVariant)),
              Text('• ${fmt.money(sale.amount)} • ${sale.payment == 'card' ? 'Card' : 'Cash'}', style: SkText.mono.copyWith(fontSize: 12.5, color: cs.onSurfaceVariant)),
            ]),
          ]),
        ),
        // Confetti: a party popper with a few specks.
        SizedBox(
          width: 46,
          height: 46,
          child: Stack(children: [
            const Positioned(right: 0, bottom: 0, child: Icon(Icons.celebration_rounded, size: 34, color: _deep)),
            Positioned(left: 2, top: 4, child: Transform.rotate(angle: 0.6, child: Container(width: 6, height: 6, color: _gold))),
            Positioned(left: 14, top: 0, child: Container(width: 5, height: 5, decoration: const BoxDecoration(color: _deep, shape: BoxShape.circle))),
            Positioned(left: 0, bottom: 10, child: Container(width: 5, height: 5, decoration: const BoxDecoration(color: _gold, shape: BoxShape.circle))),
          ]),
        ),
      ]),
    );
  }
}

/// "Done": a cream pill with a soft gold edge.
class _DoneButton extends StatelessWidget {
  const _DoneButton({required this.onPressed});
  final VoidCallback onPressed;
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return OutlinedButton.icon(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        shape: const StadiumBorder(),
        backgroundColor: cs.surface,
        foregroundColor: cs.onSurface,
        side: BorderSide(color: dark ? cs.outlineVariant : _gold.withValues(alpha: 0.45), width: 1.4),
        textStyle: const TextStyle(fontFamily: kTextFont, fontSize: 17, fontWeight: FontWeight.w700),
      ),
      onPressed: onPressed,
      icon: const Icon(Icons.receipt_long_outlined),
      label: const Text('Done'),
    );
  }
}

/// "+ New sale": the deep green pill.
class _NewSaleButton extends StatelessWidget {
  const _NewSaleButton({required this.onPressed});
  final VoidCallback onPressed;
  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          gradient: const LinearGradient(colors: [_deep, _deeper]),
          boxShadow: const [BoxShadow(color: Color(0x400A3E32), blurRadius: 16, offset: Offset(0, 7), spreadRadius: -5)],
        ),
        child: FilledButton.icon(
          style: FilledButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(56),
            shape: const StadiumBorder(),
            textStyle: const TextStyle(fontFamily: kTextFont, fontSize: 17, fontWeight: FontWeight.w700),
          ),
          onPressed: onPressed,
          icon: const Icon(Icons.add_rounded),
          label: const Text('New sale'),
        ),
      );
}
