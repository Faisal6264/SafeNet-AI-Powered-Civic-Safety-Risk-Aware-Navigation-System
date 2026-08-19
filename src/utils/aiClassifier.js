export const classifyHazardText = (description) => {
    const text = description.toLowerCase();
    const critical = ['fire', 'live wire', 'flood', 'collapse', 'deep hole', 'dark'];
    const medium = ['pothole', 'broken light', 'water leak', 'debris', 'stray'];
    
    let severity = 'Low';
    let category = 'Civic Maintenance';
    let advisory = '🟢 Low impact. Proceed with normal caution.';

    if (critical.some(k => text.includes(k))) {
        severity = 'High';
        category = 'Dangerous Condition';
        advisory = '⚠️ High risk of pedestrian/vehicular accident.';
    } else if (medium.some(k => text.includes(k))) {
        severity = 'Medium';
        category = 'Road Hazard';
        advisory = '🟡 Moderate risk. Maintain reduced speed and caution.';
    }

    return { severity, category, advisory };
};
