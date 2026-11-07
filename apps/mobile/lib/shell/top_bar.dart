import 'package:flutter/foundation.dart';
import '../core/ui/avatar.dart';
import 'package:flutter/material.dart';

import '../core/format/fmt.dart';
import '../core/ui/haptics.dart';
import '../core/ui/salon_logo.dart';
import '../models/me.dart';

/// The bar on top of every tab (Groww-style): the salon's logo and name, then Search, the AI assistant and my photo,
/// which opens my profile (settings and everything that isn't a tab). [badge] adds up unread counts for the photo.
class SkTopBar extends StatelessWidget {
  const SkTopBar({super.key, required this.me, required this.onSearch, required this.onAi, required this.onProfile, this.badge = const []});
  final Me me;
  final VoidCallback onSearch, onAi, onProfile;
  final List<ValueListenable<int>> badge;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    Widget icon(String tip, IconData i, VoidCallback onTap, Key key) => IconButton(
          key: key,
          tooltip: tip,
          onPressed: () {
            Haptic.tap();
            onTap();
          },
          icon: Icon(i, size: 26),
        );
    final avatar = SkAvatar(slug: me.org.slug, name: me.user.name, url: me.user.avatarUrl, size: 36);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 8, 6),
      child: Row(children: [
        Container(
          decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: cs.outlineVariant)),
          padding: const EdgeInsets.all(2),
          child: ClipOval(child: SalonLogo(slug: me.org.slug, name: me.salonName, logoUrl: me.salon.logoUrl, size: 38)),
        ),
        const SizedBox(width: 12),
        Expanded(child: Text(me.salonName, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.titleLarge?.copyWith(fontWeight: FontWeight.w600))),
        icon('Search', Icons.search_rounded, onSearch, const ValueKey('top-search')),
        icon('SalonKit AI', Icons.auto_awesome_outlined, onAi, const ValueKey('top-ai')),
        const SizedBox(width: 2),
        InkResponse(
          key: const ValueKey('top-profile'),
          radius: 24,
          onTap: () {
            Haptic.tap();
            onProfile();
          },
          child: Padding(
            padding: const EdgeInsets.all(6),
            child: badge.isEmpty
                ? avatar
                : ListenableBuilder(
                    listenable: Listenable.merge(badge),
                    builder: (_, _) {
                      final n = badge.fold<int>(0, (s, c) => s + c.value);
                      return Badge(isLabelVisible: n > 0, label: Text(n > 99 ? '99+' : '$n'), child: avatar);
                    },
                  ),
          ),
        ),
      ]),
    );
  }
}

/// The AI assistant isn't built yet: a short "coming soon".
Future<void> showAiSoon(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) {
        final t = Theme.of(c).textTheme;
        final cs = Theme.of(c).colorScheme;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.auto_awesome, size: 40, color: cs.primary),
              const SizedBox(height: 12),
              Text('SalonKit AI is coming', style: t.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text(
                'Ask about your sales, barbers and customers in plain words — "How did we do this week?", '
                '"Who are my regulars?" — and get the answer right here.',
                textAlign: TextAlign.center,
                style: t.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
              ),
              const SizedBox(height: 20),
              FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)), onPressed: () => Navigator.pop(c), child: const Text('Got it')),
            ]),
          ),
        );
      },
    );
