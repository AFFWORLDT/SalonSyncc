import 'package:flutter/material.dart';

import '../../core/ui/heading.dart';
import '../../core/format/fmt.dart';
import '../../core/ui/filter_chip_menu.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/states.dart';
import '../../data/ratings_api.dart';
import '../../models/me.dart';
import '../../models/ratings.dart';
import '../../shell/nav.dart';
import '../dashboard/dashboard_screen.dart' show ymd;

String _ratings(int n) => '$n rating${n == 1 ? '' : 's'}';
String _avg(num? a) => a == null ? '—' : a.toStringAsFixed(1);

/// Google review taps and star ratings for a range, by barber, newest first.
class RatingsScreen extends StatefulWidget {
  const RatingsScreen({super.key, required this.me, required this.api});
  final Me me;
  final RatingsApi api;

  @override
  State<RatingsScreen> createState() => _RatingsScreenState();
}

class _RatingsScreenState extends State<RatingsScreen> {
  late String _to = widget.me.today, _from = '${widget.me.today.substring(0, 7)}-01';
  String _show = 'all';
  RatingsReport? _r;
  Object? _error;
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final n = ++_seq;
    try {
      final r = await widget.api.report(_from, _to);
      if (mounted && n == _seq) {
        setState(() {
          _r = r;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted && n == _seq) setState(() => _error = e);
    }
  }

  Future<void> _range() async {
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.parse(widget.me.today),
      initialDateRange: DateTimeRange(start: DateTime.parse(_from), end: DateTime.parse(_to)),
    );
    if (r == null) return;
    setState(() {
      _from = ymd(r.start);
      _to = ymd(r.end);
      _r = null;
    });
    _load();
  }

  Widget _stars(int n, Color c) => Row(mainAxisSize: MainAxisSize.min, children: [for (var i = 1; i <= 5; i++) Icon(i <= n ? Icons.star_rounded : Icons.star_border_rounded, size: 18, color: c)]);

  @override
  Widget build(BuildContext context) {
    final fmt = widget.me.fmt, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final r = _r;
    final star = Colors.amber.shade700;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        SkHeading('Ratings'),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: InputChip(avatar: const Icon(Icons.date_range_outlined, size: 18), label: Text('${fmt.dayLabel(_from)} – ${fmt.dayLabel(_to)}'), onPressed: _range),
        ),
        const SizedBox(height: 10),
        if (((widget.me.settings['google_review_url'] as String?) ?? '').isEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: SkGlass(
              blur: false,
              child: Row(children: [
                Icon(Icons.link_off_rounded, color: cs.error),
                const SizedBox(width: 12),
                const Expanded(child: Text('No Google review link yet, so happy customers have nowhere to go. Add it in Settings → Reviews & links.')),
                TextButton(onPressed: () => openModule('settings'), child: const Text('Add')),
              ]),
            ),
          ),
        if (_error != null && r == null)
          ErrorState(error: _error!, onRetry: _load)
        else if (r == null)
          const SkSkeleton(height: 160, radius: 24)
        else ...[
          SkGlass(
            blur: false,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text('${r.clicked}', style: t.displaySmall?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(width: 8),
                Padding(padding: const EdgeInsets.only(bottom: 8), child: Text('to Google', style: t.titleMedium)),
              ]),
              Text('${r.clicked} of ${r.asked} customer${r.asked == 1 ? '' : 's'} tapped “Rate your visit” (${r.asked == 0 ? '—' : '${(r.clicked * 100 / r.asked).round()}%'})'),
              const SizedBox(height: 4),
              Text("They land on the salon's Google review page. Google doesn't say who posted, so this counts taps.", style: t.bodySmall),
            ]),
          ),
          if (r.google.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('Google taps by barber', style: t.titleSmall),
            for (final g in r.google)
              ListTile(dense: true, title: Text(g.name), trailing: Text('${g.clicked}/${g.asked} · ${g.asked == 0 ? '—' : '${(g.clicked * 100 / g.asked).round()}%'}')),
          ],
          if (r.count > 0) ...[
            const SizedBox(height: 12),
            SkGlass(
              blur: false,
              child: Row(children: [
                Text(_avg(r.average), style: t.displaySmall?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    _stars((r.average ?? 0).round(), star),
                    Text(_ratings(r.count)),
                    Text('Star ratings from the in-app page used before Google reviews.', style: t.bodySmall),
                  ]),
                ),
              ]),
            ),
            const SizedBox(height: 12),
            Text('By barber', style: t.titleSmall),
            for (final b in r.barbers)
              ListTile(dense: true, title: Text(b.name), subtitle: Text(_ratings(b.count)), trailing: Row(mainAxisSize: MainAxisSize.min, children: [_stars((b.average ?? 0).round(), star), const SizedBox(width: 6), Text(_avg(b.average))])),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: Text('Latest', style: t.titleSmall)),
              ChipMenu<String>(value: _show, items: const [('all', 'All ratings'), ('low', '1-3 stars'), ('comment', 'With a comment')], onChanged: (v) => setState(() => _show = v)),
            ]),
            for (final x in r.ratings.where((x) => _show == 'all' || (_show == 'low' && x.stars <= 3) || (_show == 'comment' && (x.comment ?? '').isNotEmpty)))
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Container(
                  decoration: BoxDecoration(color: x.stars <= 2 ? cs.error.withValues(alpha: 0.06) : null, borderRadius: BorderRadius.circular(16)),
                  child: SkGlass(
                    blur: false,
                    padding: const EdgeInsets.all(14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [_stars(x.stars, star), const SizedBox(width: 8), Expanded(child: Text(x.customerLabel, style: t.titleSmall))]),
                      if ((x.comment ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('“${x.comment}”')),
                      const SizedBox(height: 6),
                      Text('${x.barberName} · bill ${x.billNo} · ${fmt.dayLabel(x.day)}', style: t.bodySmall),
                    ]),
                  ),
                ),
              ),
          ],
        ],
      ]),
    );
  }
}
