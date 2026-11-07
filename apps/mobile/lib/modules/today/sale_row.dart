import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../models/sale.dart';

/// "Haircut, Hair oil ×2", or the note for an amount-only bill.
String saleWhat(Sale s) => s.items.isEmpty ? (s.note ?? '') : s.items.map((i) => i.qty > 1 ? '${i.name} ×${i.qty}' : i.name).join(', ');

/// One bill in a list: cash/card icon, customer, time · phone · what, and the amount. With [showDay] (My bills) the
/// line starts with the bill no. and the day, as the web's bills list does.
class SaleRow extends StatelessWidget {
  const SaleRow({super.key, required this.sale, required this.fmt, required this.onTap, this.showDay = false, this.showBarber = false});
  final Sale sale;
  final Fmt fmt;
  final VoidCallback onTap;
  final bool showDay;

  /// Admin lists: who did it.
  final bool showBarber;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final sub = [
      if (showDay) sale.billNo,
      showDay ? '${fmt.dayLabel(sale.day)} ${fmt.time(sale.createdAt)}' : fmt.time(sale.createdAt),
      if (showBarber) sale.barberName,
      saleWhat(sale),
      if (sale.customerPhone != null) fmt.phone(sale.customerPhone!),
    ].where((x) => x.isNotEmpty).join(' · ');
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      leading: CircleAvatar(
        backgroundColor: cs.primary.withValues(alpha: 0.12),
        foregroundColor: cs.primary,
        child: Icon(sale.payment == 'card' ? Icons.credit_card_rounded : Icons.payments_outlined, size: 20),
      ),
      title: Text(sale.customerLabel, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: Text(fmt.money(sale.amount), style: SkText.mono.copyWith(fontWeight: FontWeight.w600, fontSize: 15)),
    );
  }
}
