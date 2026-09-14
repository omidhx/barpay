import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database with realistic Persian logistics data...");

  // 1. Create Organization
  const org = await prisma.organization.upsert({
    where: { slug: "khalij-fars-logistics" },
    update: {},
    create: {
      name: "شرکت حمل و نقل سراسری خلیج فارس",
      legalName: "شرکت حمل و نقل بین‌المللی و سراسری خلیج فارس (سهامی خاص)",
      nationalId: "10101234567",
      phone: "02188776655",
      address: "تهران، میدان آرژانتین، خیابان الوند، پلاک ۱۲",
      slug: "khalij-fars-logistics",
      status: "ACTIVE",
      settings: {
        create: {
          roundMultiple: BigInt(50000),
          surchargeAmount: BigInt(700000),
          applySurchargeDefault: true,
          smsDailyCap: 2000,
          commitmentEnforcement: "ENFORCED",
        },
      },
    },
  });

  console.log(`Organization created/found: ${org.name} (${org.id})`);

  // 2. Create Users (Manager and Operator)
  const manager = await prisma.user.upsert({
    where: { id: "user-manager-seed" },
    update: {},
    create: {
      id: "user-manager-seed",
      organizationId: org.id,
      fullName: "مهندس رضا کریمی",
      mobile: "09121112233",
      role: "MANAGER",
      passwordHash: "hash-demo",
    },
  });

  const operator = await prisma.user.upsert({
    where: { id: "user-operator-seed" },
    update: {},
    create: {
      id: "user-operator-seed",
      organizationId: org.id,
      fullName: "سارا امینی (متصدی ترابری)",
      mobile: "09123334455",
      role: "OPERATOR",
      passwordHash: "hash-demo",
    },
  });

  // 3. Create Bank Cards
  await prisma.bankCard.upsert({
    where: { id: "card-mellat-seed" },
    update: {},
    create: {
      id: "card-mellat-seed",
      organizationId: org.id,
      bankCode: "MELLAT",
      holderFirstName: "شرکت حمل و نقل",
      holderLastName: "خلیج فارس",
      cardNumber: "6104337788990011",
      accountNumber: "4567890123",
      iban: "IR120120000000004567890123",
      isActive: true,
      displayOrder: 1,
    },
  });

  await prisma.bankCard.upsert({
    where: { id: "card-saman-seed" },
    update: {},
    create: {
      id: "card-saman-seed",
      organizationId: org.id,
      bankCode: "SAMAN",
      holderFirstName: "شرکت حمل و نقل",
      holderLastName: "خلیج فارس",
      cardNumber: "6219861011223344",
      accountNumber: "9876543210",
      iban: "IR270560000000009876543210",
      isActive: true,
      displayOrder: 2,
    },
  });

  // 4. Create Active Commitment Template
  const templateBody = `اینجانب {{driver_name}} با شماره تلفن همراه ثبت‌شده در سامانه، به موجب این سند رسمی اقرار می‌نمایم که بارنامه شماره {{waybill_number}} صادره در تاریخ {{issue_date}} برای حمل محموله از مبدأ {{origin}} به مقصد {{destination}} را با مشخصات کامل و بدون نقص تحویل گرفته‌ام.
مبلغ کرایه و هزینه‌های قانونی طبق سند مالی به میزان {{amount}} ریال به شرکت {{organization_name}} واریز گردیده و پرداخت هرگونه مابه‌التفاوت ناشی از کسری، اضافه بار یا تخلفات احتمالی بر عهده اینجانب می‌باشد. این اقرار الکترونیکی دارای اثر حقوقی کامل بوده و استناد به عدم اطلاع مسموع نخواهد بود.`;

  await prisma.commitmentVersion.upsert({
    where: { id: "commitment-v1-seed" },
    update: {},
    create: {
      id: "commitment-v1-seed",
      organizationId: org.id,
      title: "تعهدنامه رسمی تحویل بار و اقرار پرداخت راننده (نسخه پاییز ۱۴۰۳)",
      body: templateBody,
      variablesJson: ["driver_name", "waybill_number", "amount", "issue_date", "origin", "destination", "organization_name"],
      templateKey: "DRIVER_RELEASE_V1",
      contentHash: "template-hash-seed-1",
      status: "ACTIVE",
      isDefault: true,
      createdBy: manager.id,
    },
  });

  // 5. Create Waybills with Amounts across various phases
  const waybillDefs = [
    {
      num: "1403-1001",
      driver: "حسین حسینی",
      mobile: "09121001001",
      origin: "بندرعباس",
      dest: "تهران",
      raw: 80686445n,
      rounded: 80700000n,
      surcharge: 700000n,
      payable: 81400000n,
      shipment: "DRIVER_VIEWED" as const,
      doc: "VERIFIED" as const,
      commit: "ACCEPTED" as const,
      payment: "APPROVED" as const,
      release: "RELEASED" as const,
    },
    {
      num: "1403-1002",
      driver: "محمد رضایی",
      mobile: "09121001002",
      origin: "بوشهر",
      dest: "اصفهان",
      raw: 13712500n,
      rounded: 13750000n,
      surcharge: 700000n,
      payable: 14450000n,
      shipment: "DRIVER_VIEWED" as const,
      doc: "VERIFIED" as const,
      commit: "ACCEPTED" as const,
      payment: "APPROVED" as const,
      release: "ELIGIBLE" as const,
    },
    {
      num: "1403-1003",
      driver: "علی مرادی",
      mobile: "09121001003",
      origin: "بندر امام خمینی",
      dest: "مشهد",
      raw: 45230000n,
      rounded: 45250000n,
      surcharge: 700000n,
      payable: 45950000n,
      shipment: "DRIVER_NOTIFIED" as const,
      doc: "VERIFIED" as const,
      commit: "PENDING" as const,
      payment: "NOT_SUBMITTED" as const,
      release: "BLOCKED" as const,
    },
    {
      num: "1403-1004",
      driver: "سعید کریمی",
      mobile: "09121001004",
      origin: "عسلویه",
      dest: "تبریز",
      raw: 62100000n,
      rounded: 62100000n,
      surcharge: 700000n,
      payable: 62800000n,
      shipment: "DRIVER_VIEWED" as const,
      doc: "VERIFIED" as const,
      commit: "ACCEPTED" as const,
      payment: "SUBMITTED" as const,
      release: "BLOCKED" as const,
    },
    {
      num: "1403-1005",
      driver: "محسن ابراهیمی",
      mobile: "09121001005",
      origin: "چابهار",
      dest: "شیراز",
      raw: 28450000n,
      rounded: 28450000n,
      surcharge: 700000n,
      payable: 29150000n,
      shipment: "READY_FOR_DRIVER" as const,
      doc: "VERIFIED" as const,
      commit: "PENDING" as const,
      payment: "NOT_SUBMITTED" as const,
      release: "BLOCKED" as const,
    },
    {
      num: "1403-1006",
      driver: "اکبر باقری",
      mobile: "09121001006",
      origin: "سیرجان",
      dest: "اراک",
      raw: 35000000n,
      rounded: 35000000n,
      surcharge: 700000n,
      payable: 35700000n,
      shipment: "IMPORTED" as const,
      doc: "NOT_UPLOADED" as const,
      commit: "NOT_REQUIRED" as const,
      payment: "NOT_REQUIRED" as const,
      release: "BLOCKED" as const,
    },
  ];

  let demoWaybillId = "";

  for (const def of waybillDefs) {
    const wb = await prisma.waybill.upsert({
      where: {
        organizationId_waybillNumber_waybillYearKey: {
          organizationId: org.id,
          waybillNumber: def.num,
          waybillYearKey: 1403,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        waybillNumber: def.num,
        waybillYear: 1403,
        driverNameRaw: def.driver,
        driverMobileRaw: def.mobile,
        origin: def.origin,
        destination: def.dest,
        issueDate: new Date(),
        shipmentStatus: def.shipment,
        documentStatus: def.doc,
        commitmentStatus: def.commit,
        paymentStatus: def.payment,
        releaseStatus: def.release,
      },
    });

    if (def.num === "1403-1003") {
      demoWaybillId = wb.id;
    }

    let amtId = wb.currentAmountId;
    if (!amtId) {
      const amt = await prisma.waybillAmount.create({
        data: {
          organizationId: org.id,
          waybillId: wb.id,
          rawExcelAmount: def.raw,
          roundedAmount: def.rounded,
          surchargeAmount: def.surcharge,
          amount: def.payable,
          isCurrent: true,
          status: "APPROVED",
        },
      });
      amtId = amt.id;

      await prisma.waybill.update({
        where: { id: wb.id },
        data: { currentAmountId: amt.id },
      });

      if (def.payment === "APPROVED") {
        await prisma.payment.create({
          data: {
            organizationId: org.id,
            waybillId: wb.id,
            waybillAmountId: amt.id,
            method: "CARD_TO_CARD",
            status: "APPROVED",
            amount: def.payable,
            trackingNumber: `TRK-${def.num}`,
            reviewedBy: operator.id,
            reviewedAt: new Date(),
          },
        });
      } else if (def.payment === "SUBMITTED") {
        await prisma.payment.create({
          data: {
            organizationId: org.id,
            waybillId: wb.id,
            waybillAmountId: amt.id,
            method: "CARD_TO_CARD",
            status: "SUBMITTED",
            amount: def.payable,
            trackingNumber: `TRK-SUB-${def.num}`,
            createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // > 4 hours ago for Stale warning SLA!
          },
        });
      }
    }
  }

  // 6. Create Demo Driver Link for user to click and view directly on localhost
  if (demoWaybillId) {
    const crypto = await import("crypto");
    const demoToken = "demo-driver-token";
    const HMAC_SECRET =
      process.env.APP_SECRET ||
      process.env.GATEWAY_CREDENTIALS_KEY ||
      "barnameh-pay-default-secret-key-32-bytes-minimum";
    const tokenHash = crypto.createHmac("sha256", HMAC_SECRET).update(demoToken).digest("hex");

    await prisma.driverAccessLink.upsert({
      where: { tokenHash },
      update: {},
      create: {
        organizationId: org.id,
        waybillId: demoWaybillId,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days valid
      },
    });

    console.log(`Demo driver access link created! Token: ${demoToken}`);
  }

  // 7. Seed sample In-App Notifications
  const notifCount = await prisma.notification.count({ where: { organizationId: org.id } });
  if (notifCount === 0) {
    await prisma.notification.createMany({
      data: [
        {
          organizationId: org.id,
          userId: operator.id,
          title: "پرداخت جدید در انتظار بررسی",
          message: "راننده سعید کریمی مبلغ ۶۲٬۸۰۰٬۰۰۰ ریال برای بارنامه ۱۴۰۳-۱۰۰۴ را پرداخت و رسید ارسال کرد.",
          entityType: "PAYMENT",
          isRead: false,
        },
        {
          organizationId: org.id,
          title: "هشدار تاخیر SLA بازبینی",
          message: "پرداخت بارنامه ۱۴۰۳-۱۰۰۴ بیش از ۴ ساعت در صف بررسی باقی مانده است.",
          entityType: "PAYMENT",
          isRead: false,
        },
        {
          organizationId: org.id,
          title: "پیامک ناموفق",
          message: "ارسال پیامک لینک به راننده اکبر باقری (۰۹۱۲۱۰۰۱۰۰۶) به دلیل خاموش بودن تلفن ناموفق بود.",
          entityType: "SMS",
          isRead: true,
        },
      ],
    });
  }

  // 8. Seed sample SMS jobs
  const jobCount = await prisma.notificationJob.count({ where: { organizationId: org.id } });
  if (jobCount === 0) {
    await prisma.notificationJob.createMany({
    data: [
      {
        organizationId: org.id,
        channel: "SMS",
        recipient: "09121001001",
        templateKey: "DRIVER_LINK",
        payloadJson: { text: "لینک ورود راننده حسین حسینی" },
        status: "SENT",
        provider: "FARAZSMS",
      },
      {
        organizationId: org.id,
        channel: "SMS",
        recipient: "09121001002",
        templateKey: "PAYMENT_CONFIRMED",
        payloadJson: { text: "پرداخت شما تایید شد" },
        status: "SENT",
        provider: "FARAZSMS",
      },
      {
        organizationId: org.id,
        channel: "SMS",
        recipient: "09121001006",
        templateKey: "DRIVER_LINK",
        payloadJson: { text: "لینک ورود راننده اکبر باقری" },
        status: "FAILED",
        lastError: "Driver phone is power off or unreachable",
        attempts: 2,
      },
    ],
  });
}

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
