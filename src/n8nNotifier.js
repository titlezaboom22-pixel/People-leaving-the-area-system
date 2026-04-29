// n8nNotifier.js
// Helper สำหรับเรียก n8n webhooks (TBKK SOC Workflow Automation)
//
// ตั้งค่า env: VITE_N8N_WEBHOOK_BASE=https://your-n8n.com/webhook
// ดู docs/INTEGRATION.md ในโฟลเดอร์ n8n-workflow/

const N8N_BASE_URL =
  import.meta.env.VITE_N8N_WEBHOOK_BASE ||
  'http://localhost:5678/webhook';

export async function notifyNewApproval(payload) {
  try {
    const res = await fetch(`${N8N_BASE_URL}/soc-new-approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId:     payload.documentId,
        documentType:   payload.documentType,
        requesterName:  payload.requesterName,
        requesterDept:  payload.requesterDept,
        requesterEmail: payload.requesterEmail,
        approverEmail:  payload.approverEmail,
        approveUrl:     payload.approveUrl,
        details:        payload.details,
      }),
    });
    if (!res.ok) throw new Error(`n8n webhook ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[n8n] notifyNewApproval failed:', err);
    return { success: false, error: err.message };
  }
}

export async function notifyApprovalResponse(payload) {
  try {
    const res = await fetch(`${N8N_BASE_URL}/soc-approval-response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId:     payload.documentId,
        documentType:   payload.documentType,
        status:         payload.status,
        approverName:   payload.approverName,
        requesterEmail: payload.requesterEmail,
        requesterName:  payload.requesterName,
        comment:        payload.comment || '-',
      }),
    });
    if (!res.ok) throw new Error(`n8n webhook ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[n8n] notifyApprovalResponse failed:', err);
    return { success: false, error: err.message };
  }
}
