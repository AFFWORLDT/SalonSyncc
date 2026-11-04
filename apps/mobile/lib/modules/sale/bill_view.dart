import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../models/sale.dart';
import '../../models/settings.dart';

/// The bill laid out like the web's (and the public receipt): salon header, bill details, lines, totals with VAT
/// inside the total, and the footer. Always dark on white, like paper.
class BillView extends StatelessWidget {
  const BillView({super.key, required this.sale, required this.settings, required this.fmt});
  final Sale sale;
  final SalonSettings settings;
  final Fmt fmt;

  @override
  Widget build(BuildContext context) {
    final tax = sale.vatRate > 0;
    final lines = sale.items.isNotEmpty ? sale.items : [SaleItem(name: (sale.note ?? '').isNotEmpty ? sale.note! : 'Salon service', price: sale.amount, qty: 1)];
    final rate = sale.vatRate == sale.vatRate.roundToDouble() ? '${sale.vatRate.round()}%' : '${sale.vatRate}%';
    const ink = Color(0xFF111111);
    const small = TextStyle(fontSize: 12, color: ink);
    final mono = SkText.mono.copyWith(fontSize: 12.5, color: ink);
    Widget kv(String k, String v) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [Text('$k: ', style: small.copyWith(fontWeight: FontWeight.w700)), Text(v, style: small)],
        );
    Widget total(String k, int v, {bool bold = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(children: [
            Expanded(child: Text(k, style: small.copyWith(fontWeight: bold ? FontWeight.w700 : null))),
            Text(fmt.money(v), style: mono.copyWith(fontWeight: bold ? FontWeight.w700 : null)),
          ]),
        );
    const dash = Divider(color: Color(0x4D000000), height: 20);
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: const Color(0x1A000000))),
      child: DefaultTextStyle(
        style: small,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(settings.displayName, textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: ink)),
          if ((settings.address ?? '').isNotEmpty) Text(settings.address!, textAlign: TextAlign.center, style: small),
          if ((settings.phone ?? '').isNotEmpty) Text('Phone: ${fmt.phone(settings.phone!)}', textAlign: TextAlign.center, style: small),
          if (tax && (settings.trn ?? '').isNotEmpty)
            Text('${RegExp(r'^\d{15}$').hasMatch(settings.trn!) ? 'TRN' : 'Tax no.'}: ${settings.trn}', textAlign: TextAlign.center, style: small),
          const SizedBox(height: 8),
          Text(tax ? 'TAX INVOICE' : 'BILL', textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 2.6, color: ink)),
          dash,
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(mainAxisSize: MainAxisSize.min, children: [Text('No: ', style: small.copyWith(fontWeight: FontWeight.w700)), Text(sale.billNo, style: small)]),
                kv('Date', '${fmt.dateLabel(sale.day)} ${fmt.time(sale.createdAt)}'),
                kv('Barber', sale.barberName),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              kv('Client', sale.customerLabel),
              if (sale.customerPhone != null) Text(fmt.phone(sale.customerPhone!), style: small),
              kv('Mode', sale.payment.toUpperCase()),
            ]),
          ]),
          dash,
          for (final l in lines)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(children: [
                Expanded(child: Text(l.name, style: small)),
                if (l.qty > 1) Text('${l.qty} × ${fmt.num(l.price)}  ', style: mono.copyWith(color: const Color(0xFF555555))),
                Text(fmt.money(l.total), style: mono),
              ]),
            ),
          dash,
          if (tax) ...[
            total('Total (incl. VAT)', sale.amount, bold: true),
            total('Taxable amount', sale.amount - sale.vatAmount),
            total('VAT $rate', sale.vatAmount),
          ] else
            total('Total', sale.amount, bold: true),
          dash,
          Text(
            (settings.receiptFooter ?? '').trim().isNotEmpty ? settings.receiptFooter!.trim() : 'Thank you for visiting ${settings.displayName}!',
            textAlign: TextAlign.center,
            style: small,
          ),
        ]),
      ),
    );
  }
}
