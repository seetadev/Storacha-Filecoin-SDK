import { Client } from "@storacha/client";
import { Signer } from "@storacha/client/principal/ed25519";
import { create } from "@storacha/client";
import { StoreMemory } from "@storacha/client/stores/memory";
import * as Proof from "@storacha/client/proof";
import { Request, Response } from "express";
import * as Delegation from "@ucanto/core/delegation";
import { DID } from "@ucanto/core";
import { Link } from "@ucanto/core/schema";
import { Ability, Capabilities, Capability } from "@storacha/client/types";
/**
 * Initializes a Storacha client using user-provided key and proof.
 *
 * @returns {Promise<Client.Client>} Initialized W3UP client
 */
export async function initStorachaClient(): Promise<Client> {
  const principal = Signer.parse(process.env.STORACHA_KEY!);
  const store = new StoreMemory();
  const client = await create({ principal, store });

  const proof = await Proof.parse(process.env.STORACHA_PROOF!);
  const space = await client.addSpace(proof);

  await client.setCurrentSpace(space.did());

  return client;
}

/**
 * Function to create UCAN delegation to grant access of a space to an agent
 * @param req
 * @param res
 * @returns
 */
export const createUCANDelegation = async (
  recipientDID: string,
  deadline: number,
  notBefore: number,
  baseCapabilities: Ability[],
  fileCID: string
) => {
  try {
    const client = await initStorachaClient();
    const spaceDID = client.agent.did();
    const audience = DID.parse(recipientDID);
    const agent = client.agent;

    const capabilities: Capabilities = baseCapabilities.map(
      (can: Ability): Capability => ({
        with: spaceDID,
        can,
        nb: { root: Link.parse(fileCID) },
      })
    ) as Capabilities;

    const ucan = await Delegation.delegate({
      issuer: agent.issuer,
      audience,
      expiration: Number(deadline),
      notBefore: Number(notBefore),
      capabilities,
    });

    const archive = await ucan.archive();
    if (!archive.ok) {
      throw new Error("Failed to create delegation archive");
    }
    return archive.ok;
  } catch (err) {
    console.error("Error creating UCAN delegation:", err);
  }
};
