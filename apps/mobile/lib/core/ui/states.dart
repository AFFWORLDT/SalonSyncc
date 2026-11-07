import 'package:flutter/material.dart';

import '../api/api_error.dart';
import 'motion.dart';

/// Safe text for any failure: an [ApiError]'s message, else the generic one.
String messageOf(Object e) => e is ApiError ? e.message : kGeneric;

/// A grey block that gently pulses while the real content loads (still when reduce-motion is on).
class SkSkeleton extends StatefulWidget {
  const SkSkeleton({super.key, this.height = 16, this.width, this.radius = 12});
  final double height;
  final double? width;
  final double radius;

  @override
  State<SkSkeleton> createState() => _SkSkeletonState();
}

class _SkSkeletonState extends State<SkSkeleton> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900), lowerBound: 0.45, upperBound: 1);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (skDuration(context) == Duration.zero) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: _c,
        child: Container(
          key: const ValueKey('skeleton'),
          height: widget.height,
          width: widget.width,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(widget.radius),
          ),
        ),
      );
}

/// A failed load: the reason and a Retry button.
class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          _Badge(icon: error is Offline ? Icons.wifi_off_rounded : Icons.error_outline_rounded, color: Theme.of(context).colorScheme.error),
          const SizedBox(height: 14),
          Text(messageOf(error), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
          const SizedBox(height: 16),
          FilledButton.tonalIcon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
        ]),
      );
}

/// Nothing to show yet, in plain words, with an optional next step (e.g. "Add staff").
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.text, this.icon = Icons.inbox_outlined, this.action, this.onAction});
  final String text;
  final IconData icon;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        _Badge(icon: icon, color: cs.onSurfaceVariant),
        const SizedBox(height: 12),
        Text(text, textAlign: TextAlign.center, style: TextStyle(color: cs.onSurfaceVariant)),
        if (action != null && onAction != null) ...[
          const SizedBox(height: 14),
          FilledButton.tonal(onPressed: onAction, child: Text(action!)),
        ],
      ]),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.icon, required this.color});
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        width: 64,
        height: 64,
        decoration: BoxDecoration(color: color.withValues(alpha: 0.1), shape: BoxShape.circle),
        child: Icon(icon, size: 30, color: color),
      );
}

/// A first load of a list: [count] placeholder rows, so the screen doesn't jump when the data comes.
class SkSkeletonList extends StatelessWidget {
  const SkSkeletonList({super.key, this.count = 4, this.height = 64, this.gap = 8});
  final int count;
  final double height, gap;

  @override
  Widget build(BuildContext context) => Column(children: [
        for (var i = 0; i < count; i++) Padding(padding: EdgeInsets.only(bottom: gap), child: SkSkeleton(height: height, radius: 16)),
      ]);
}
