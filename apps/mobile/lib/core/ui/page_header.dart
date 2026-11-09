import 'package:flutter/material.dart';

import 'haptics.dart';

/// A full-screen page's top: a round back button, a bold title, and small pill actions on the right
/// ("Bill Details · Share").
class SkPageHeader extends StatelessWidget {
  const SkPageHeader({super.key, required this.title, this.subtitle, this.onBack, this.actions = const []});
  final String title;
  final String? subtitle;
  final VoidCallback? onBack;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Row(children: [
        _Round(
          tooltip: 'Back',
          onTap: onBack ?? () => Navigator.of(context).maybePop(),
          child: Icon(Icons.arrow_back_rounded, color: cs.onSurface),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.5)),
            if (subtitle != null) Text(subtitle!, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
          ]),
        ),
        for (final a in actions) ...[const SizedBox(width: 8), a],
      ]),
    );
  }
}

/// A small white pill with an icon and a word ("Share", "Edit").
class SkPillAction extends StatelessWidget {
  const SkPillAction({super.key, required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: cs.surface,
      shape: StadiumBorder(side: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.6))),
      elevation: 1,
      shadowColor: Colors.black26,
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: () {
          Haptic.tap();
          onTap();
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 20, color: cs.onSurface),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: cs.onSurface)),
          ]),
        ),
      ),
    );
  }
}

/// A 46px white circle button.
class _Round extends StatelessWidget {
  const _Round({required this.tooltip, required this.onTap, required this.child});
  final String tooltip;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Tooltip(
      message: tooltip,
      child: Material(
        color: cs.surface,
        shape: CircleBorder(side: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.6))),
        elevation: 1,
        shadowColor: Colors.black26,
        child: InkWell(customBorder: const CircleBorder(), onTap: onTap, child: SizedBox(width: 46, height: 46, child: Center(child: child))),
      ),
    );
  }
}
