import 'package:flutter/material.dart';

/// A full-width outlined button with the provider's mark ("Continue with Google / Apple"), as Google's and Apple's
/// guidelines ask.
class SkSocialButton extends StatelessWidget {
  const SkSocialButton({super.key, required this.label, required this.icon, required this.onPressed});
  final String label;
  final Widget icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => OutlinedButton(
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
        onPressed: onPressed,
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          SizedBox(width: 24, child: Center(child: icon)),
          const SizedBox(width: 10),
          Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
        ]),
      );
}
