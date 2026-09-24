import 'package:flutter/material.dart';

class AlertCard extends StatelessWidget {
  final Color color;
  final String title;
  final String subtitle;
  final String description;
  final String buttonText;

  const AlertCard({
    super.key,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.description,
    required this.buttonText,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
  width: double.infinity, // 🔥 FULL WIDTH
  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
  padding: const EdgeInsets.all(20),
  decoration: BoxDecoration(
    gradient: LinearGradient(
      colors: color == Colors.red
          ? [Colors.red, Colors.redAccent]
          : [Colors.amber, Colors.orange],
    ),
    borderRadius: BorderRadius.circular(20),
  ),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.center,
    children: [
      const Icon(Icons.warning_amber_rounded,
          color: Colors.white, size: 40),

      const SizedBox(height: 10),

      Text(
        title,
        textAlign: TextAlign.center,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.bold,
        ),
      ),

      const SizedBox(height: 6),

      Text(
        subtitle,
        style: const TextStyle(color: Colors.white70),
      ),

      const SizedBox(height: 10),

      Text(
        description,
        textAlign: TextAlign.center,
        style: const TextStyle(color: Colors.white),
      ),

      if (buttonText.isNotEmpty) ...[
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            buttonText,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
      ]
    ],
  ),
);
  }
}