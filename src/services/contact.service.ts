import type { Contact, Prisma } from "../generated/prisma/client.js";
import { LinkPrecedence } from "../generated/prisma/enums.js";
import { prisma } from "../prisma.lib.js";

export interface IdentifyResponse {
  primaryContactId: number;
  emails: string[];
  phoneNumbers: string[];
  secondaryContactIds: number[];
}

export const identifyContact = async (
  email?: string,
  phoneNumber?: string,
): Promise<IdentifyResponse> => {
  return await prisma.$transaction(async (txn: Prisma.TransactionClient) => {
    const primaryContact = await insertAndUpdateContactsAndGetPrimary(
      txn,
      email,
      phoneNumber,
    );

    // Final result
    const finalContacts = await prisma.contact.findMany({
      where: {
        OR: [{ id: primaryContact.id }, { linkedId: primaryContact.id }],
      },
      orderBy: { createdAt: "asc" },
    });

    return makeResponse(primaryContact, finalContacts);
  });
};

function makeResponse(primaryContact: Contact, finalContacts: Contact[]) {
  const emails = [
    ...new Set(finalContacts.map((c) => c.email).filter((x) => x != null)),
  ];

  const phoneNumbers = [
    ...new Set(
      finalContacts.map((c) => c.phoneNumber).filter((x) => x != null),
    ),
  ];

  const secondaryContactIds = finalContacts
    .filter((c) => c.linkPrecedence === LinkPrecedence.secondary)
    .map((c) => c.id);

  return {
    primaryContactId: primaryContact.id,
    emails,
    phoneNumbers,
    secondaryContactIds,
  };
}

async function insertAndUpdateContactsAndGetPrimary(
  txn: Prisma.TransactionClient,
  email?: string,
  phoneNumber?: string,
): Promise<Contact> {
  // Find existing
  const contacts = await txn.contact.findMany({
    where: {
      OR: [
        ...(email ? [{ email }] : []),
        ...(phoneNumber ? [{ phoneNumber }] : []),
      ],
    },
    orderBy: {
      id: "asc",
    },
  });

  if (contacts.length === 0) {
    // Create new if none found
    return await txn.contact.create({
      data: {
        phoneNumber: phoneNumber ?? null,
        email: email ?? null,
        linkedId: null,
        linkPrecedence: LinkPrecedence.primary,
      },
    });
  } else {
    // Get all primaries
    const uniquePrimaryIds = [
      ...new Set(
        contacts
          .map((c) =>
            c.linkPrecedence === LinkPrecedence.primary ? c.id : c.linkedId,
          )
          .filter((lid) => lid != null),
      ),
    ];

    const primaryContracts: Contact[] = await prisma.contact.findMany({
      where: { id: { in: uniquePrimaryIds } },
      orderBy: { createdAt: "asc" },
    });

    const [primaryContact, ...notPrimaryAnymore] = primaryContracts;

    if (!primaryContact) throw Error("primaryContact undefined!");

    // If multiple primaries exist
    for (const p of notPrimaryAnymore) {
      // Demote primary
      await txn.contact.update({
        where: { id: p.id },
        data: {
          linkPrecedence: LinkPrecedence.secondary,
          linkedId: primaryContact.id,
        },
      });
      // Update dep
      await txn.contact.updateMany({
        where: { linkedId: p.id },
        data: { linkedId: primaryContact.id },
      });
    }

    const contactAlreadyExists = contacts.find(
      (c) =>
        c.email === (email ?? null) && c.phoneNumber === (phoneNumber ?? null),
    );

    if (!contactAlreadyExists) {
      // Generate new secondary
      await txn.contact.create({
        data: {
          email: email ?? null,
          phoneNumber: phoneNumber ?? null,
          linkedId: primaryContact.id,
          linkPrecedence: LinkPrecedence.secondary,
        },
      });
    }

    return primaryContact;
  }
}
