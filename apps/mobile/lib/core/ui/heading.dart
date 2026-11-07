import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../theme/scale.dart';

/// A screen's big title (the one heading per screen; the top bar or a collapsing app bar never repeats it), an
/// optional line under it, and an optional action on the right (e.g. "Add staff").
class SkHeading extends StatelessWidget {
  const SkHeading(this.title, {super.key, this.subtitle, this.action, this.mono = false});
  final String title;
  final String? subtitle;
  final Widget? action;

  /// The subtitle in the mono face (dates, ranges).
  final bool mono;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final sub = mono ? SkText.mono.copyWith(fontSize: 13, color: cs.onSurfaceVariant) : t.bodyMedium?.copyWith(color: cs.onSurfaceVariant);
    return Padding(
      padding: const EdgeInsets.only(top: SkSpace.xs, bottom: SkSpace.md),
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.3)),
            if (subtitle != null) ...[const SizedBox(height: 2), Text(subtitle!, style: sub)],
          ]),
        ),
        if (action != null) ...[const SizedBox(width: SkSpace.md), action!],
      ]),
    );
  }
}

/// A section label inside a screen ("Barbers today", "Owner"), with an optional text action on the right.
class SkSection extends StatelessWidget {
  const SkSection(this.label, {super.key, this.action, this.onAction, this.actionTooltip, this.top = SkSpace.xl});
  final String label;
  final String? action, actionTooltip;
  final VoidCallback? onAction;
  final double top;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    return Padding(
      padding: EdgeInsets.only(top: top, bottom: SkSpace.sm),
      child: Row(children: [
        Expanded(child: Text(label, style: t.titleMedium?.copyWith(fontWeight: FontWeight.w600))),
        if (action != null && onAction != null)
          Tooltip(
            message: actionTooltip ?? action!,
            child: TextButton(
              style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: SkSpace.sm), tapTargetSize: MaterialTapTargetSize.padded),
              onPressed: onAction,
              child: Text(action!, style: TextStyle(color: cs.primary, fontWeight: FontWeight.w600)),
            ),
          ),
      ]),
    );
  }
}
