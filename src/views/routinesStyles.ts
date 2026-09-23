// Styles for the Routines page.
//
// Contrast tokens (WCAG formula, measured foreground on background): ink
// #161616 on white 18.10, muted #595959 on white 7.00, white on accent
// #0b5fff 5.13, white on danger #b42318 6.57, white on pine #166534
// 7.13, badge ink #1f1f1f on #f2f2f2 14.72. The focus ring reuses the
// accent at 3px, above the 3.0 non-text floor. Error text uses the danger
// ink on white (6.57); the sidebar glyph stays host-rendered, so the view
// ships text badges instead of icons.
export const ROUTINES_CSS = [
  '.hr-root{box-sizing:border-box;max-width:880px;margin:0 auto;padding:24px;font-family:inherit;color:#161616;background:#ffffff;}',
  '.hr-title{font-size:22px;line-height:1.3;margin:0 0 8px;color:#161616;}',
  '.hr-sub{margin:0 0 8px;color:#595959;font-size:14px;line-height:1.5;}',
  '.hr-label{display:block;font-weight:600;margin:16px 0 6px;color:#161616;}',
  '.hr-select,.hr-input{display:block;width:100%;max-width:420px;padding:8px 10px;font-size:14px;color:#161616;background:#ffffff;border:1px solid #6e6e6e;border-radius:6px;}',
  '.hr-fieldset{margin:20px 0 0;border:1px solid #d9d9d9;border-radius:8px;padding:16px;}',
  '.hr-fieldset legend{font-weight:600;padding:0 6px;color:#161616;}',
  '.hr-btn{display:inline-block;padding:8px 14px;font-size:14px;font-weight:600;color:#161616;background:#ffffff;border:1px solid #6e6e6e;border-radius:6px;cursor:pointer;}',
  '.hr-btn:disabled{opacity:0.55;cursor:not-allowed;}',
  '.hr-btn-primary{background:#0b5fff;border-color:#0b5fff;color:#ffffff;}',
  '.hr-btn-danger{background:#b42318;border-color:#b42318;color:#ffffff;}',
  '.hr-btn-current{outline:2px solid #0b5fff;outline-offset:2px;}',
  '.hr-filters{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0;}',
  '.hr-list{list-style:none;margin:12px 0;padding:0;}',
  '.hr-row-item{border:1px solid #d9d9d9;border-radius:8px;padding:12px;margin-bottom:8px;}',
  '.hr-row-id{font-weight:600;color:#161616;overflow-wrap:anywhere;}',
  '.hr-row-meta{color:#595959;font-size:13px;line-height:1.5;}',
  '.hr-row-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}',
  '.hr-confirm{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;}',
  '.hr-badge{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;margin-left:8px;}',
  '.hr-badge-active{background:#166534;color:#ffffff;}',
  '.hr-badge-paused{background:#f2f2f2;color:#1f1f1f;border:1px solid #6e6e6e;}',
  '.hr-error{border:1px solid #b42318;border-left-width:6px;border-radius:8px;padding:12px;background:#ffffff;color:#161616;margin:12px 0;}',
  '.hr-error strong{color:#b42318;}',
  '.hr-empty{border:1px dashed #6e6e6e;border-radius:8px;padding:16px;color:#595959;margin:12px 0;}',
  '.hr-muted{color:#595959;font-size:14px;line-height:1.5;}',
  '.hr-status{margin-top:16px;color:#595959;font-size:13px;}',
  '.hr-root :focus-visible{outline:3px solid #0b5fff;outline-offset:2px;}',
  '@media (max-width:560px){.hr-row-actions{flex-direction:column;align-items:stretch;}}',
].join('\n');
