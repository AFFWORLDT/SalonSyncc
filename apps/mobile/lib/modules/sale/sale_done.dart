import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/motion.dart';
import '../../models/sale.dart';

/// "Congrats! Bill generated": the bill in short, sharing (when given), then Done or another sale.
class SaleDone extends StatelessWidget {
  const SaleDone({super.key, required this.sale, required this.fmt, this.actions, required this.onDone, required this.onNew});
  final Sale sale;
  final Fmt fmt;
  final Widget? actions;
  final VoidCallback onDone, onNew;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.fromLTRB(20, 48, 20, 24), children: [
          Center(
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0.6, end: 1),
              duration: skDuration(context, 350),
              curve: Curves.elasticOut,
              builder: (_, v, child) => Transform.scale(scale: v, child: child),
              child: CircleAvatar(radius: 40, backgroundColor: cs.primary, foregroundColor: cs.onPrimary, child: const Icon(Icons.check_rounded, size: 44)),
            ),
          ),
          const SizedBox(height: 20),
          Text('Congrats! Bill generated', textAlign: TextAlign.center, style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),
          SkGlass(
            child: Column(children: [
              Text(sale.billNo, style: SkText.mono.copyWith(color: cs.onSurfaceVariant)),
              const SizedBox(height: 6),
              Text(fmt.money(sale.amount), style: SkText.mono.copyWith(fontSize: 30, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text('${sale.customerLabel} · ${sale.payment == 'card' ? 'Card' : 'Cash'}', style: t.bodyMedium),
            ]),
          ),
          if (actions != null) ...[const SizedBox(height: 16), actions!],
        ]),
      ),
      // Always on screen, however tall the bill and sharing get.
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: Row(children: [
            Expanded(
              child: OutlinedButton.icon(style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)), onPressed: onNew, icon: const Icon(Icons.add_rounded), label: const Text('New sale')),
            ),
            const SizedBox(width: 12),
            Expanded(child: FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)), onPressed: onDone, child: const Text('Done'))),
          ]),
        ),
      ),
    );
  }
}
