import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/config.dart';
import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../models/sale.dart';
import '../../models/settings.dart';

const _ink = Color(0xFF111111);
const _faint = Color(0x4D000000);

/// The bill laid out like the web's `<Bill>` (apps/web/src/components/app/bill.tsx) and the public receipt: logo and
/// salon header, bill details, a Service / Qty / Price / Amount table, totals with VAT inside the total, and the footer.
/// The receipt's typewriter face (its own, so app-wide number styling never changes the printed bill).
const _paperMono = TextStyle(fontFamily: kMonoFont, fontFeatures: [FontFeature.tabularFigures()]);

/// Always dark on white, like paper, in the mono face.
class BillView extends StatelessWidget {
  const BillView({super.key, required this.sale, required this.settings, required this.fmt, this.slug, this.onFillDetails});
  final Sale sale;
  final SalonSettings settings;
  final Fmt fmt;

  /// The salon's slug, to load its uploaded logo; without it (or a logo) the SalonKit mark shows.
  final String? slug;

  /// Admins only: missing salon details show as tappable "+ Add …" lines that open Settings. Customers never see
  /// these (the bill link and PDF are drawn by the server).
  final VoidCallback? onFillDetails;

  @override
  Widget build(BuildContext context) {
    final tax = sale.vatRate > 0;
    final lines = sale.items.isNotEmpty ? sale.items : [SaleItem(name: (sale.note ?? '').isNotEmpty ? sale.note! : 'Salon service', price: sale.amount, qty: 1)];
    final rate = sale.vatRate == sale.vatRate.roundToDouble() ? '${sale.vatRate.round()}%' : '${sale.vatRate}%';
    final name = settings.displayName;
    final base = _paperMono.copyWith(fontSize: 12, height: 1.45, color: _ink);
    final bold = base.copyWith(fontWeight: FontWeight.w600);
    final sans = TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: _ink, fontFamily: Theme.of(context).textTheme.bodyMedium?.fontFamily);
    String fixed(int v) => (v / fmt.minor).toStringAsFixed(fmt.digits);

    Widget kv(String k, String v, {TextAlign align = TextAlign.start}) =>
        Text.rich(TextSpan(children: [TextSpan(text: '$k: ', style: bold), TextSpan(text: v)]), style: base, textAlign: align);

    // Service | Qty | Price | (VAT) | Amount, like the web table.
    final cols = <int, TableColumnWidth>{0: const FlexColumnWidth(), for (var i = 1; i <= (tax ? 4 : 3); i++) i: const IntrinsicColumnWidth()};
    TableRow row(List<String> cells, TextStyle style, Border border) => TableRow(
          decoration: BoxDecoration(border: border),
          children: [
            for (var i = 0; i < cells.length; i++)
              Padding(
                padding: EdgeInsets.fromLTRB(i == 0 ? 0 : 10, 6, 0, 6),
                child: Text(cells[i], style: style, textAlign: i == 0 ? TextAlign.start : TextAlign.end),
              ),
          ],
        );

    Widget sum(String k, int v, {bool strong = false}) => Padding(
          padding: const EdgeInsets.only(top: 3),
          child: Row(children: [
            Expanded(child: Text(k, style: strong ? bold.copyWith(fontSize: 14) : base)),
            Text(fmt.money(v), style: strong ? bold.copyWith(fontSize: 14) : base),
          ]),
        );

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0x1A000000)),
        boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 24, offset: Offset(0, 8))],
      ),
      child: DefaultTextStyle(
        style: base,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          // Header
          Center(
            child: onFillDetails != null && settings.logoUrl == null
                ? _Missing(label: 'Add logo', onTap: onFillDetails!, circle: true)
                : _BillLogo(slug: slug, logoUrl: settings.logoUrl),
          ),
          const SizedBox(height: 10),
          Text(name, textAlign: TextAlign.center, style: sans),
          if ((settings.nameAr ?? '').isNotEmpty) Text(settings.nameAr!, textAlign: TextAlign.center, textDirection: TextDirection.rtl, style: sans.copyWith(fontSize: 14, fontWeight: FontWeight.w500)),
          if ((settings.address ?? '').isNotEmpty)
            Text(settings.address!, textAlign: TextAlign.center, style: base.copyWith(fontSize: 11))
          else if (onFillDetails != null)
            _Missing(label: 'Add your salon address', onTap: onFillDetails!),
          if ((settings.phone ?? '').isNotEmpty)
            Text('Phone: ${fmt.phone(settings.phone!)}', textAlign: TextAlign.center, style: base.copyWith(fontSize: 11))
          else if (onFillDetails != null)
            _Missing(label: 'Add your salon phone', onTap: onFillDetails!),
          if (tax && (settings.trn ?? '').isNotEmpty)
            Text('${RegExp(r'^\d{15}$').hasMatch(settings.trn!) ? 'TRN' : 'Tax no.'}: ${settings.trn}', textAlign: TextAlign.center, style: base.copyWith(fontSize: 11)),
          const SizedBox(height: 10),
          Text(tax ? 'TAX INVOICE' : 'BILL', textAlign: TextAlign.center, style: bold.copyWith(fontSize: 14, fontWeight: FontWeight.w700, letterSpacing: 3)),
          const SizedBox(height: 14),

          // Details
          const _Dashed(),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  kv('No', sale.billNo),
                  kv('Date', fmt.dateTime(sale.createdAt)),
                  kv('Barber', sale.barberName),
                ]),
              ),
              const SizedBox(width: 12),
              Flexible(
                child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  kv('Client', sale.customerLabel, align: TextAlign.end),
                  if (sale.customerPhone != null) Text(fmt.phone(sale.customerPhone!), textAlign: TextAlign.end),
                  kv('Mode', sale.payment.toUpperCase(), align: TextAlign.end),
                ]),
              ),
            ]),
          ),

          // Lines
          Table(
            columnWidths: cols,
            defaultVerticalAlignment: TableCellVerticalAlignment.middle,
            children: [
              row(['Service', 'Qty', 'Price', if (tax) 'VAT', 'Amount'], bold, const Border(bottom: BorderSide(color: _ink))),
              for (final l in lines)
                row([l.name, '${l.qty}', fixed(l.price), if (tax) rate, fixed(l.total)], base, const Border(bottom: BorderSide(color: _faint, width: 0.5))),
            ],
          ),
          if (sale.items.isNotEmpty && (sale.note ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Note: ${sale.note}')),

          // Totals: a right-hand block, like the web.
          const SizedBox(height: 14),
          Align(
            alignment: Alignment.centerRight,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 240),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Divider(color: _ink, height: 1, thickness: 1),
                const SizedBox(height: 6),
                sum(tax ? 'Total (incl. VAT)' : 'Total', sale.amount, strong: true),
                if (tax) ...[
                  sum('Taxable amount', sale.amount - sale.vatAmount),
                  sum('VAT $rate', sale.vatAmount),
                ],
              ]),
            ),
          ),

          // Footer
          const SizedBox(height: 16),
          const _Dashed(),
          const SizedBox(height: 12),
          if (tax) Text('Prices include VAT. Amounts in ${fmt.currency}.', textAlign: TextAlign.center, style: base.copyWith(fontSize: 11, color: const Color(0x99000000))),
          Text(
            (settings.receiptFooter ?? '').trim().isNotEmpty ? settings.receiptFooter!.trim() : (name.isEmpty ? 'Thank you for visiting!' : 'Thank you for visiting $name!'),
            textAlign: TextAlign.center,
            style: base.copyWith(fontSize: 11, color: const Color(0x99000000)),
          ),
        ]),
      ),
    );
  }
}

/// The salon's logo in a circle, or the SalonKit mark (web: settings.logo_url || /brand/mark.png).
class _BillLogo extends StatelessWidget {
  const _BillLogo({this.slug, this.logoUrl});
  final String? slug, logoUrl;
  static const size = 64.0;

  @override
  Widget build(BuildContext context) {
    final mark = Image.asset('assets/brand/icon.png', width: size, height: size, fit: BoxFit.cover);
    final img = slug == null || logoUrl == null
        ? mark
        : CachedNetworkImage(
            imageUrl: absolute(salonBase(slug!), logoUrl!).toString(),
            width: size,
            height: size,
            fit: BoxFit.contain,
            placeholder: (_, _) => const SizedBox(width: size, height: size),
            errorWidget: (_, _, _) => mark,
          );
    return ClipOval(child: SizedBox(width: size, height: size, child: img));
  }
}

/// A placeholder for a salon detail the admin hasn't filled in yet: grey, dashed, "+ Add …", opens Settings.
class _Missing extends StatelessWidget {
  const _Missing({required this.label, required this.onTap, this.circle = false});
  final String label;
  final VoidCallback onTap;
  final bool circle;

  @override
  Widget build(BuildContext context) {
    const grey = Color(0xFF8A8A8A);
    if (circle) {
      return GestureDetector(
        onTap: onTap,
        child: Container(
          key: const ValueKey('bill-add-logo'),
          width: 64,
          height: 64,
          decoration: BoxDecoration(shape: BoxShape.circle, color: const Color(0xFFF2F2F2), border: Border.all(color: const Color(0x33000000))),
          child: const Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(Icons.add_photo_alternate_outlined, size: 20, color: grey),
            Text('Logo', style: TextStyle(fontSize: 10, color: grey)),
          ]),
        ),
      );
    }
    return Center(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          margin: const EdgeInsets.only(top: 4),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0x40000000))),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.add_rounded, size: 14, color: grey),
            const SizedBox(width: 4),
            Text(label, style: const TextStyle(fontSize: 11, color: grey, fontStyle: FontStyle.italic)),
          ]),
        ),
      ),
    );
  }
}

/// A dashed hairline (web: border-dashed border-black/30).
class _Dashed extends StatelessWidget {
  const _Dashed();

  @override
  Widget build(BuildContext context) => SizedBox(height: 1, width: double.infinity, child: CustomPaint(painter: _DashPainter()));
}

class _DashPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = _faint
      ..strokeWidth = 1;
    for (double x = 0; x < size.width; x += 6) {
      canvas.drawLine(Offset(x, 0.5), Offset((x + 3).clamp(0, size.width), 0.5), p);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
