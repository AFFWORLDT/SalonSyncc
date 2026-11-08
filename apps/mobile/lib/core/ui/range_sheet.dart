import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../theme/app_theme.dart';
import '../theme/scale.dart';
import 'haptics.dart';

/// Picks a date range in a bottom sheet: one month at a time (opening on [today]'s month, or [initial]'s end), tap the
/// first day then the last, or a quick choice. Days after [today] can't be picked. Null when dismissed.
Future<DateTimeRange?> showSkRangeSheet(BuildContext context, {required DateTime today, DateTimeRange? initial, DateTime? first}) =>
    showModalBottomSheet<DateTimeRange>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => SkRangeSheet(today: _d(today), initial: initial, first: _d(first ?? DateTime(2020))),
    );

DateTime _d(DateTime t) => DateTime(t.year, t.month, t.day);

class SkRangeSheet extends StatefulWidget {
  const SkRangeSheet({super.key, required this.today, required this.first, this.initial});
  final DateTime today, first;
  final DateTimeRange? initial;

  @override
  State<SkRangeSheet> createState() => _SkRangeSheetState();
}

class _SkRangeSheetState extends State<SkRangeSheet> {
  DateTime? _start, _end;
  late DateTime _month;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    if (i != null) {
      _start = _d(i.start);
      _end = _d(i.end);
    }
    final m = _end ?? widget.today;
    _month = DateTime(m.year, m.month);
  }

  DateTime get _thisMonth => DateTime(widget.today.year, widget.today.month);
  bool get _canNext => _month.isBefore(_thisMonth);
  bool get _canPrev => _month.isAfter(DateTime(widget.first.year, widget.first.month));

  void _go(int by) {
    Haptic.tap();
    setState(() => _month = DateTime(_month.year, _month.month + by));
  }

  void _tap(DateTime day) {
    Haptic.tap();
    setState(() {
      if (_start == null || _end != null || day.isBefore(_start!)) {
        _start = day;
        _end = null;
      } else {
        _end = day;
      }
    });
  }

  void _quick(DateTime s, DateTime e) {
    Haptic.select();
    final end = e.isAfter(widget.today) ? widget.today : e;
    setState(() {
      _start = s;
      _end = end;
      _month = DateTime(end.year, end.month);
    });
  }

  void _apply() {
    Haptic.select();
    Navigator.pop(context, DateTimeRange(start: _start!, end: _end ?? _start!));
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.today, cs = Theme.of(context).colorScheme, tt = Theme.of(context).textTheme;
    final f = DateFormat('d MMM y', 'en_US');
    final quick = <(String, DateTime, DateTime)>[
      ('This month', DateTime(t.year, t.month), t),
      ('Last month', DateTime(t.year, t.month - 1), DateTime(t.year, t.month, 0)),
      ('Last 3 months', DateTime(t.year, t.month - 2), t),
      ('This year', DateTime(t.year), t),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(SkSpace.gutter, 0, SkSpace.gutter, SkSpace.lg),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Custom range', style: tt.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: SkSpace.sm),
        Row(children: [
          Expanded(child: _Ends(label: 'From', value: _start == null ? 'Pick a day' : f.format(_start!), active: _start == null || _end != null)),
          const SizedBox(width: SkSpace.sm),
          Expanded(child: _Ends(label: 'To', value: _end == null ? (_start == null ? '—' : 'Pick a day') : f.format(_end!), active: _start != null && _end == null)),
        ]),
        const SizedBox(height: SkSpace.md),
        SizedBox(
          height: 48,
          child: ListView(scrollDirection: Axis.horizontal, children: [
            for (final q in quick)
              Padding(
                padding: const EdgeInsets.only(right: SkSpace.sm),
                child: Center(
                  child: ActionChip(
                    label: Text(q.$1),
                    onPressed: () => _quick(q.$2, q.$3),
                    side: BorderSide(color: cs.outlineVariant),
                    shape: const StadiumBorder(),
                  ),
                ),
              ),
          ]),
        ),
        const SizedBox(height: SkSpace.sm),
        Row(children: [
          IconButton(tooltip: 'Previous month', onPressed: _canPrev ? () => _go(-1) : null, icon: const Icon(Icons.chevron_left_rounded)),
          Expanded(
            child: Text(DateFormat('MMMM y', 'en_US').format(_month), textAlign: TextAlign.center, style: tt.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          ),
          IconButton(tooltip: 'Next month', onPressed: _canNext ? () => _go(1) : null, icon: const Icon(Icons.chevron_right_rounded)),
        ]),
        const SizedBox(height: SkSpace.xs),
        _MonthGrid(month: _month, start: _start, end: _end, today: t, first: widget.first, onTap: _tap),
        const SizedBox(height: SkSpace.lg),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50), textStyle: const TextStyle(fontFamily: kTextFont, fontSize: 16, fontWeight: FontWeight.w600)),
          onPressed: _start == null ? null : _apply,
          child: Text(_start == null ? 'Pick the first day' : (_end == null || _end == _start ? 'Show ${f.format(_start!)}' : 'Apply')),
        ),
      ]),
    );
  }
}

class _Ends extends StatelessWidget {
  const _Ends({required this.label, required this.value, required this.active});
  final String label, value;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      padding: const EdgeInsets.symmetric(horizontal: SkSpace.md, vertical: SkSpace.sm),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(SkRadius.md),
        border: Border.all(color: active ? cs.primary : cs.outlineVariant, width: active ? 1.5 : 1),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
        const SizedBox(height: 2),
        Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

class _MonthGrid extends StatelessWidget {
  const _MonthGrid({required this.month, required this.start, required this.end, required this.today, required this.first, required this.onTap});
  final DateTime month, today, first;
  final DateTime? start, end;
  final ValueChanged<DateTime> onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final days = DateTime(month.year, month.month + 1, 0).day;
    final lead = DateTime(month.year, month.month).weekday % 7; // Sunday first
    final cells = <Widget>[
      for (final w in const ['S', 'M', 'T', 'W', 'T', 'F', 'S'])
        Center(child: Text(w, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: cs.onSurfaceVariant))),
      for (var i = 0; i < lead; i++) const SizedBox.shrink(),
      for (var d = 1; d <= days; d++) _day(context, DateTime(month.year, month.month, d)),
    ];
    return GridView.count(
      crossAxisCount: 7,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.1,
      children: cells,
    );
  }

  Widget _day(BuildContext context, DateTime day) {
    final cs = Theme.of(context).colorScheme;
    final off = day.isAfter(today) || day.isBefore(first);
    final isStart = start != null && day == start, isEnd = end != null && day == end;
    final inside = start != null && end != null && day.isAfter(start!) && day.isBefore(end!);
    final edge = isStart || isEnd;
    final band = end != null && end != start && (inside || edge);
    final isToday = day == today;
    final tint = cs.primary.withValues(alpha: 0.14);
    return Semantics(
      button: !off,
      selected: edge,
      label: DateFormat('d MMMM y', 'en_US').format(day),
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: off ? null : () => onTap(day),
        child: Stack(alignment: Alignment.center, children: [
          if (band)
            Positioned(
              top: 4,
              bottom: 4,
              left: 0,
              right: 0,
              child: Row(children: [
                Expanded(child: ColoredBox(color: isStart ? Colors.transparent : tint)),
                Expanded(child: ColoredBox(color: isEnd ? Colors.transparent : tint)),
              ]),
            ),
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: edge ? cs.primary : null,
              border: isToday && !edge ? Border.all(color: cs.primary) : null,
            ),
            child: Text(
              '${day.day}',
              style: TextStyle(
                fontSize: 14,
                fontWeight: edge || isToday ? FontWeight.w700 : FontWeight.w500,
                color: edge ? cs.onPrimary : (off ? cs.onSurface.withValues(alpha: 0.3) : cs.onSurface),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}
