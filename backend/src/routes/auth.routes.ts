import { Router, Request, Response } from "express";
import { UcanService } from "../services/ucan.service.js";
import { PaymentService } from "../services/payment.service.js";

const router: Router = Router();
const ucanService = UcanService.getInstance();
const paymentService = new PaymentService();

/**
 * POST /api/auth/authorize
 * Request a UCAN token to download a file.
 * Requires: pieceCid, userAddress
 */
router.post("/authorize", async (req: Request, res: Response) => {
  try {
    const { pieceCid, userAddress } = req.body;

    if (!pieceCid || !userAddress) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields: pieceCid, userAddress" 
      });
    }


    console.log(`Verifying payment for ${pieceCid} by ${userAddress}...`);
    
    const isPaid = await paymentService.verifyPayment(pieceCid, userAddress);

    if (!isPaid) {
      return res.status(402).json({ 
        success: false, 
        error: "Payment required. No valid payment found for this file and user address." 
      });
    }

    const userDid = `did:pkh:eip155:1:${userAddress.toLowerCase()}`; 
    
    console.log(`Issuing UCAN for CID: ${pieceCid} to User: ${userDid}`);
    
    const token = await ucanService.issueRetrievalToken(userDid, pieceCid);

    res.json({
      success: true,
      token,
      expiresIn: 3600
    });

  } catch (error: any) {
    console.error("Auth error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;