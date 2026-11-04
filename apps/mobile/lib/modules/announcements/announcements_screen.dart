import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/states.dart';
import '../../data/notices_api.dart';
import '../../models/me.dart';
import '../../models/notice.dart';

/// Announcements and other updates for this barber, newest first. Opening the screen marks them all read.
class AnnouncementsScreen extends StatefulWidget {
  const AnnouncementsScreen({super.key, required this.me, required this.api, required this.unread});
  final Me me;
  final NoticesApi api;
  final ValueNotifier<int> unread;

  @override
  State<AnnouncementsScreen> createState() => _AnnouncementsScreenState();
}

class _AnnouncementsScreenState extends State<AnnouncementsScreen> {
  NoticeFeed? _feed;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final f = await widget.api.list();
      if (!mounted) return;
      setState(() {
        _feed = f;
        _error = null;
      });
      if (f.unread > 0) {
        await widget.api.markAllRead();
        widget.unread.value = 0;
      }
    } catch (e) {
      if (mounted && _feed == null) setState(() => _error = e);
    }
  }

  String _when(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms);
    final ymd = '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    final fmt = widget.me.fmt;
    return ymd == widget.me.today ? fmt.time(ms) : '${fmt.dayLabel(ymd)} · ${fmt.time(ms)}';
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final f = _feed;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        if (_error != null && f == null)
          ErrorState(error: _error!, onRetry: _load)
        else if (f == null)
          for (var i = 0; i < 4; i++) const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: SkSkeleton(height: 64))
        else if (f.items.isEmpty)
          const EmptyState(text: 'No announcements yet', icon: Icons.campaign_outlined)
        else
          for (final Notice n in f.items)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SkGlass(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 6, right: 10),
                    child: n.isRead
                        ? const SizedBox(width: 8)
                        : Container(key: ValueKey('unread-${n.id}'), width: 8, height: 8, decoration: BoxDecoration(color: cs.primary, shape: BoxShape.circle)),
                  ),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(n.title, style: t.titleSmall?.copyWith(fontWeight: n.isRead ? null : FontWeight.w700)),
                      if ((n.body ?? '').isNotEmpty) ...[const SizedBox(height: 4), Text(n.body!, style: t.bodyMedium)],
                      const SizedBox(height: 6),
                      Text(_when(n.createdAt), style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                    ]),
                  ),
                ]),
              ),
            ),
      ]),
    );
  }
}
