migrate(
	(app) => {
		app
			.db()
			.newQuery(
				`
                                CREATE TRIGGER funding_pledge_payment_integrity
                                BEFORE INSERT ON funding_pledge_payments
                                WHEN NOT EXISTS (
                                        SELECT 1
                                        FROM funding_pledges
                                        WHERE id = NEW.pledge
                                          AND organization = NEW.organization
                                )
                                BEGIN
                                        SELECT RAISE(
                                                ABORT,
                                                'Pledge payment must belong to the same organization as its pledge.'
                                        );
                                END
                        `
			)
			.execute();
	},
	(app) => {
		app.db().newQuery('DROP TRIGGER IF EXISTS funding_pledge_payment_integrity').execute();
	}
);
