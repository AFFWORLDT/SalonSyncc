import 'package:flutter/material.dart';

import 'haptics.dart';

/// "Sign out?" with Cancel / Sign out; true only when the person confirms.
Future<bool> confirmSignOut(BuildContext context) async {
  Haptic.warning();
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      icon: const Icon(Icons.logout_rounded),
      title: const Text('Sign out?'),
      content: const Text("You'll need your username and password to sign in again on this phone."),
      actions: [
        TextButton(key: const ValueKey('signout-cancel'), onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
        FilledButton(
          key: const ValueKey('signout-yes'),
          style: FilledButton.styleFrom(backgroundColor: Theme.of(c).colorScheme.error, foregroundColor: Theme.of(c).colorScheme.onError),
          onPressed: () => Navigator.pop(c, true),
          child: const Text('Yes, sign out'),
        ),
      ],
    ),
  );
  return ok == true;
}
