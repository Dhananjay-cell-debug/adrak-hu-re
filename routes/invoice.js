const express  = require('express');
const PDFDocument = require('pdfkit');
const nodemailer  = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const router   = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const ADMIN_EMAIL = 'dhananjaychitmila@gmail.com';

// ── Gmail SMTP transporter ──────────────────────────────────────────────────
function getMailer() {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        }
    });
}

// ── Generate Invoice Number ─────────────────────────────────────────────────
async function nextInvoiceNumber() {
    const { data } = await supabase.rpc('nextval_invoice', {});
    // Fallback if RPC not available
    const seq = data || Date.now();
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    return `VELT-${year}${month}-${seq}`;
}

// ── Build PDF Buffer ────────────────────────────────────────────────────────
function generateInvoicePDF(invoiceData) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers = [];

        doc.on('data', buf => buffers.push(buf));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        const { invoice_number, brand_name, brand_email, campaign_title,
                pay_per_reel, total_slots, amount, issued_at } = invoiceData;

        const amountINR = amount;
        const dateStr = new Date(issued_at).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'long', year: 'numeric'
        });

        // ── Header ──
        doc.fontSize(28).font('Helvetica-Bold').fillColor('#111111')
           .text('VELT INDUSTRIES', 50, 50);
        doc.fontSize(9).font('Helvetica').fillColor('#999999')
           .text('Where Creators Do Business', 50, 82);

        // Invoice tag
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#FF6B35')
           .text('INVOICE', 400, 50, { align: 'right' });
        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text(invoice_number, 400, 66, { align: 'right' });
        doc.text(`Date: ${dateStr}`, 400, 80, { align: 'right' });

        // Divider
        doc.moveTo(50, 105).lineTo(545, 105).strokeColor('#eeeeee').lineWidth(1).stroke();

        // ── Bill To ──
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#999999')
           .text('BILL TO', 50, 120);
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#111111')
           .text(brand_name || brand_email, 50, 136);
        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text(brand_email, 50, 153);

        // ── From ──
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#999999')
           .text('FROM', 350, 120);
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#111111')
           .text('Velt Industries', 350, 136);
        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text('dhananjaychitmila@gmail.com', 350, 153);

        // ── Campaign Details Table ──
        const tableTop = 195;

        // Table header
        doc.rect(50, tableTop, 495, 30).fillColor('#F9FAFB').fill();
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666');
        doc.text('DESCRIPTION', 60, tableTop + 10);
        doc.text('QTY', 320, tableTop + 10);
        doc.text('RATE', 380, tableTop + 10);
        doc.text('AMOUNT', 460, tableTop + 10);

        // Campaign row
        const rowY = tableTop + 40;
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111')
           .text(campaign_title || 'Campaign', 60, rowY);
        doc.fontSize(9).font('Helvetica').fillColor('#666666')
           .text('Creator marketing campaign', 60, rowY + 16);

        doc.fontSize(11).font('Helvetica').fillColor('#111111');
        doc.text(String(total_slots || 1), 320, rowY);
        doc.text(`₹${(pay_per_reel || 0).toLocaleString('en-IN')}`, 380, rowY);
        doc.font('Helvetica-Bold')
           .text(`₹${amountINR.toLocaleString('en-IN')}`, 460, rowY);

        // Divider
        doc.moveTo(50, rowY + 40).lineTo(545, rowY + 40).strokeColor('#eeeeee').lineWidth(1).stroke();

        // ── Totals ──
        const totalsY = rowY + 55;
        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text('Subtotal', 380, totalsY);
        doc.font('Helvetica-Bold').fillColor('#111111')
           .text(`₹${amountINR.toLocaleString('en-IN')}`, 460, totalsY);

        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text('Platform Fee', 380, totalsY + 20);
        doc.font('Helvetica').fillColor('#111111')
           .text('₹0', 460, totalsY + 20);

        doc.moveTo(380, totalsY + 40).lineTo(545, totalsY + 40).strokeColor('#dddddd').lineWidth(1).stroke();

        doc.fontSize(14).font('Helvetica-Bold').fillColor('#111111')
           .text('TOTAL', 380, totalsY + 50);
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#FF6B35')
           .text(`₹${amountINR.toLocaleString('en-IN')}`, 460, totalsY + 50);

        // ── Payment Instructions ──
        const payY = totalsY + 90;
        doc.rect(50, payY, 495, 80).fillColor('#FFF5F2').fill();
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#FF6B35')
           .text('PAYMENT INSTRUCTIONS', 65, payY + 12);
        doc.fontSize(10).font('Helvetica').fillColor('#333333');

        const bankName = process.env.PAYMENT_BANK_NAME || '';
        const accNum = process.env.PAYMENT_ACCOUNT_NUMBER || '';
        const ifsc = process.env.PAYMENT_IFSC || '';
        const upiId = process.env.PAYMENT_UPI_ID || '';
        const accName = process.env.PAYMENT_ACCOUNT_NAME || 'Velt Industries';

        doc.text(`Bank: ${bankName}  |  A/C: ${accNum}  |  IFSC: ${ifsc}`, 65, payY + 30);
        doc.text(`Account Name: ${accName}`, 65, payY + 46);
        if (upiId) doc.text(`UPI: ${upiId}`, 65, payY + 62);

        // ── Footer ──
        const footY = 720;
        doc.moveTo(50, footY).lineTo(545, footY).strokeColor('#eeeeee').lineWidth(1).stroke();
        doc.fontSize(8).font('Helvetica').fillColor('#999999')
           .text('This is a system-generated invoice by Velt Industries. After payment, submit UTR number on your Brand Hub dashboard.', 50, footY + 10, { align: 'center', width: 495 });
        doc.text(`${invoice_number} · Generated on ${dateStr}`, 50, footY + 25, { align: 'center', width: 495 });

        doc.end();
    });
}

// ── POST /api/invoice/generate ──────────────────────────────────────────────
// Auto-generates invoice when a campaign is created (called internally)
router.post('/generate', async (req, res) => {
    const { campaign_id, brand_email } = req.body;
    if (!campaign_id || !brand_email) {
        return res.status(400).json({ error: 'campaign_id and brand_email required' });
    }

    try {
        // Check if invoice already exists for this campaign
        const { data: existing } = await supabase
            .from('invoices')
            .select('id, invoice_number')
            .eq('campaign_id', campaign_id)
            .limit(1);

        if (existing && existing.length > 0) {
            return res.json({ success: true, invoice: existing[0], message: 'Invoice already exists' });
        }

        // Get campaign details
        const { data: campaigns } = await supabase
            .from('brand_campaigns')
            .select('*, brands(company_name)')
            .eq('id', campaign_id)
            .limit(1);

        if (!campaigns || campaigns.length === 0) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        const campaign = campaigns[0];
        const invoiceNumber = await nextInvoiceNumber();

        const invoiceData = {
            invoice_number: invoiceNumber,
            campaign_id,
            brand_email,
            brand_name: campaign.brands?.company_name || brand_email,
            campaign_title: campaign.title,
            amount: campaign.total_budget || 0,
            pay_per_reel: campaign.pay_per_reel,
            total_slots: campaign.total_slots,
            issued_at: new Date().toISOString()
        };

        // Generate PDF
        const pdfBuffer = await generateInvoicePDF(invoiceData);
        const pdfBase64 = pdfBuffer.toString('base64');

        // Save invoice record to DB
        const { data: invoice, error: dbErr } = await supabase
            .from('invoices')
            .insert({
                invoice_number: invoiceNumber,
                campaign_id,
                brand_email,
                brand_name: invoiceData.brand_name,
                campaign_title: campaign.title,
                amount: campaign.total_budget || 0,
                pay_per_reel: campaign.pay_per_reel,
                total_slots: campaign.total_slots,
                status: 'generated'
            })
            .select();

        if (dbErr) throw dbErr;

        // Send email with invoice PDF
        const mailer = getMailer();
        if (mailer) {
            const emailHTML = `
                <div style="font-family:Inter,Arial,sans-serif; max-width:600px; margin:0 auto;">
                    <div style="background:#111; padding:24px 32px; border-radius:16px 16px 0 0;">
                        <h1 style="color:#fff; font-size:20px; margin:0;">VELT INDUSTRIES</h1>
                        <p style="color:#999; font-size:12px; margin:4px 0 0 0;">Invoice for your campaign</p>
                    </div>
                    <div style="padding:32px; border:1px solid #eee; border-top:none; border-radius:0 0 16px 16px;">
                        <p style="color:#333; font-size:15px;">Hi <strong>${invoiceData.brand_name}</strong>,</p>
                        <p style="color:#666; font-size:14px;">Your campaign <strong>"${campaign.title}"</strong> has been created on Velt Industries. Please find your invoice attached.</p>
                        <div style="background:#F9FAFB; padding:20px; border-radius:12px; margin:20px 0;">
                            <table style="width:100%; font-size:14px; color:#333;">
                                <tr><td style="padding:6px 0; color:#999;">Invoice No.</td><td style="text-align:right; font-weight:700;">${invoiceNumber}</td></tr>
                                <tr><td style="padding:6px 0; color:#999;">Campaign</td><td style="text-align:right; font-weight:700;">${campaign.title}</td></tr>
                                <tr><td style="padding:6px 0; color:#999;">Slots</td><td style="text-align:right;">${campaign.total_slots}</td></tr>
                                <tr><td style="padding:6px 0; color:#999;">Rate/Reel</td><td style="text-align:right;">₹${(campaign.pay_per_reel||0).toLocaleString('en-IN')}</td></tr>
                                <tr style="border-top:1px solid #eee;"><td style="padding:12px 0 6px; font-weight:700; font-size:16px;">Total</td><td style="text-align:right; font-weight:800; font-size:16px; color:#FF6B35;">₹${(campaign.total_budget||0).toLocaleString('en-IN')}</td></tr>
                            </table>
                        </div>
                        <p style="color:#666; font-size:13px;">Please transfer the amount to our bank account and submit the UTR number on your <a href="https://velt-industries.vercel.app/brand-hub.html" style="color:#FF6B35;">Brand Hub dashboard</a>.</p>
                        <p style="color:#999; font-size:11px; margin-top:24px;">This is a system-generated email from Velt Industries.</p>
                    </div>
                </div>`;

            // Send to brand
            await mailer.sendMail({
                from: `"Velt Industries" <${process.env.GMAIL_USER}>`,
                to: brand_email,
                subject: `Invoice ${invoiceNumber} — ${campaign.title} | Velt Industries`,
                html: emailHTML,
                attachments: [{
                    filename: `${invoiceNumber}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }]
            }).catch(err => console.error('Brand email error:', err.message));

            // Send copy to CEO
            await mailer.sendMail({
                from: `"Velt Industries" <${process.env.GMAIL_USER}>`,
                to: ADMIN_EMAIL,
                subject: `[Copy] Invoice ${invoiceNumber} — ${invoiceData.brand_name} | ${campaign.title}`,
                html: emailHTML,
                attachments: [{
                    filename: `${invoiceNumber}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }]
            }).catch(err => console.error('CEO email error:', err.message));
        }

        res.json({
            success: true,
            invoice: invoice && invoice[0],
            invoice_number: invoiceNumber,
            pdf_base64: pdfBase64,
            message: 'Invoice generated' + (mailer ? ' and emailed' : ' (email not configured)')
        });

    } catch (err) {
        console.error('invoice/generate error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/invoice/download/:campaign_id ──────────────────────────────────
// Download invoice PDF for a campaign
router.get('/download/:campaign_id', async (req, res) => {
    const { campaign_id } = req.params;
    const { email } = req.query;

    try {
        // Get invoice data
        const { data: invoices } = await supabase
            .from('invoices')
            .select('*')
            .eq('campaign_id', campaign_id)
            .limit(1);

        if (!invoices || invoices.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const inv = invoices[0];

        // Security: only brand owner or admin can download
        if (email !== inv.brand_email && email !== ADMIN_EMAIL) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Regenerate PDF (stateless — no file storage needed)
        const pdfBuffer = await generateInvoicePDF({
            invoice_number: inv.invoice_number,
            brand_name: inv.brand_name,
            brand_email: inv.brand_email,
            campaign_title: inv.campaign_title,
            amount: inv.amount,
            pay_per_reel: inv.pay_per_reel,
            total_slots: inv.total_slots,
            issued_at: inv.issued_at || inv.created_at
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${inv.invoice_number}.pdf"`);
        res.send(pdfBuffer);

    } catch (err) {
        console.error('invoice/download error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/invoice/list ───────────────────────────────────────────────────
// List invoices for a brand or all (admin)
router.get('/list', async (req, res) => {
    const { email, admin_email } = req.query;

    let query = supabase.from('invoices').select('*').order('created_at', { ascending: false });

    if (admin_email === ADMIN_EMAIL) {
        // Admin sees all
    } else if (email) {
        query = query.eq('brand_email', email);
    } else {
        return res.status(400).json({ error: 'email or admin_email required' });
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ data: data || [] });
});

module.exports = router;
