class AlertModel {
  final String title;
  final String severity;
  final String description;
  final String precautions;

  AlertModel({
    required this.title,
    required this.severity,
    required this.description,
    required this.precautions,
  });

  factory AlertModel.fromMap(Map<String, dynamic> data) {
    return AlertModel(
      title: data['title'],
      severity: data['severity'],
      description: data['description'],
      precautions: data['precautions'],
    );
  }
}