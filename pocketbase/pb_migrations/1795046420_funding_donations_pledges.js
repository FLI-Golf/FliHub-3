migrate(
	(app) => {
		const organizations = app.findCollectionByNameOrId('organizations');
		const events = app.findCollectionByNameOrId('events');
		const users = app.findCollectionByNameOrId('users');

		const manage = [
			'@request.auth.id != ""',
			'@collection.memberships.organization.id ?= organization.id',
			'@collection.memberships.user.id ?= @request.auth.id',
			'(@collection.memberships.role ?= "owner" || @collection.memberships.role ?= "admin")',
			'organization.capabilities ~ \'"donations-pledges"\''
		].join(' && ');

		const organizationField = () => ({
			name: 'organization',
			type: 'relation',
			collectionId: organizations.id,
			maxSelect: 1,
			required: true
		});

		const eventField = () => ({
			name: 'event',
			type: 'relation',
			collectionId: events.id,
			maxSelect: 1
		});

		const recordedByField = () => ({
			name: 'recordedBy',
			type: 'relation',
			collectionId: users.id,
			maxSelect: 1,
			required: true
		});

		const amountField = () => ({
			name: 'amountCents',
			type: 'number',
			required: true,
			onlyInt: true,
			min: 1,
			max: 99999999999
		});

		const currencyField = () => ({
			name: 'currency',
			type: 'select',
			required: true,
			maxSelect: 1,
			values: ['USD', 'CAD', 'EUR', 'GBP']
		});

		const methodField = () => ({
			name: 'method',
			type: 'select',
			required: true,
			maxSelect: 1,
			values: ['bank-transfer', 'check', 'card', 'cash', 'other']
		});

		const commonFields = () => [
			organizationField(),
			eventField(),
			{ name: 'beneficiary', type: 'text', max: 200 },
			{ name: 'contributor', type: 'text', required: true, max: 200 },
			amountField(),
			currencyField(),
			recordedByField(),
			{ name: 'created', type: 'autodate', onCreate: true }
		];

		app.save(
			new Collection({
				name: 'funding_donations',
				type: 'base',
				listRule: manage,
				viewRule: manage,
				createRule: manage,
				updateRule: null,
				deleteRule: null,
				fields: [
					...commonFields(),
					{ name: 'receivedOn', type: 'text', required: true, max: 10 },
					methodField(),
					{ name: 'reference', type: 'text', max: 200 }
				],
				indexes: ['CREATE INDEX idx_funding_donations_org ON funding_donations (organization)']
			})
		);

		app.save(
			new Collection({
				name: 'funding_pledges',
				type: 'base',
				listRule: manage,
				viewRule: manage,
				createRule: manage,
				updateRule: null,
				deleteRule: null,
				fields: [
					...commonFields(),
					{ name: 'pledgedOn', type: 'text', required: true, max: 10 },
					{ name: 'dueOn', type: 'text', max: 10 }
				],
				indexes: ['CREATE INDEX idx_funding_pledges_org ON funding_pledges (organization)']
			})
		);

		const pledges = app.findCollectionByNameOrId('funding_pledges');

		app.save(
			new Collection({
				name: 'funding_pledge_payments',
				type: 'base',
				listRule: manage,
				viewRule: manage,
				createRule: manage,
				updateRule: null,
				deleteRule: null,
				fields: [
					organizationField(),
					{
						name: 'pledge',
						type: 'relation',
						collectionId: pledges.id,
						maxSelect: 1,
						required: true
					},
					recordedByField(),
					amountField(),
					{ name: 'receivedOn', type: 'text', required: true, max: 10 },
					methodField(),
					{ name: 'reference', type: 'text', max: 200 },
					{ name: 'created', type: 'autodate', onCreate: true }
				],
				indexes: [
					'CREATE INDEX idx_funding_pledge_payments_pledge ON funding_pledge_payments (pledge)'
				]
			})
		);

		app
			.db()
			.newQuery(
				`
                CREATE TRIGGER funding_pledge_payment_ceiling
                BEFORE INSERT ON funding_pledge_payments
                WHEN NEW.amountCents + COALESCE((
                        SELECT SUM(amountCents)
                        FROM funding_pledge_payments
                        WHERE pledge = NEW.pledge
                ), 0) > (
                        SELECT amountCents
                        FROM funding_pledges
                        WHERE id = NEW.pledge
                )
                BEGIN
                        SELECT RAISE(ABORT, 'Pledge payments cannot exceed the pledged amount.');
                END
                `
			)
			.execute();
	},
	(app) => {
		app.db().newQuery('DROP TRIGGER IF EXISTS funding_pledge_payment_ceiling').execute();
		for (const name of ['funding_pledge_payments', 'funding_pledges', 'funding_donations']) {
			app.delete(app.findCollectionByNameOrId(name));
		}
	}
);
