/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const snapshot = [
			{
				createRule: null,
				deleteRule: null,
				fields: [
					{
						autogeneratePattern: '[a-z0-9]{15}',
						help: '',
						hidden: false,
						id: 'text3208210256',
						max: 15,
						min: 15,
						name: 'id',
						pattern: '^[a-z0-9]+$',
						presentable: false,
						primaryKey: true,
						required: true,
						system: true,
						type: 'text'
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: false,
						id: 'text455797646',
						max: 0,
						min: 0,
						name: 'collectionRef',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: true,
						system: true,
						type: 'text'
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: false,
						id: 'text127846527',
						max: 0,
						min: 0,
						name: 'recordRef',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: true,
						system: true,
						type: 'text'
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: false,
						id: 'text1582905952',
						max: 0,
						min: 0,
						name: 'method',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: true,
						system: true,
						type: 'text'
					},
					{
						hidden: false,
						id: 'autodate2990389176',
						name: 'created',
						onCreate: true,
						onUpdate: false,
						presentable: false,
						system: true,
						type: 'autodate'
					},
					{
						hidden: false,
						id: 'autodate3332085495',
						name: 'updated',
						onCreate: true,
						onUpdate: true,
						presentable: false,
						system: true,
						type: 'autodate'
					}
				],
				id: 'pbc_2279338944',
				indexes: [
					'CREATE INDEX `idx_mfas_collectionRef_recordRef` ON `_mfas` (collectionRef,recordRef)'
				],
				listRule:
					"@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId",
				name: '_mfas',
				system: true,
				type: 'base',
				updateRule: null,
				viewRule:
					"@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId"
			},
			{
				createRule: null,
				deleteRule: null,
				fields: [
					{
						autogeneratePattern: '[a-z0-9]{15}',
						help: '',
						hidden: false,
						id: 'text3208210256',
						max: 15,
						min: 15,
						name: 'id',
						pattern: '^[a-z0-9]+$',
						presentable: false,
						primaryKey: true,
						required: true,
						system: true,
						type: 'text'
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: false,
						id: 'text455797646',
						max: 0,
						min: 0,
						name: 'collectionRef',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: true,
						system: true,
						type: 'text'
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: false,
						id: 'text127846527',
						max: 0,
						min: 0,
						name: 'recordRef',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: true,
						system: true,
						type: 'text'
					},
					{
						cost: 8,
						help: '',
						hidden: true,
						id: 'password901924565',
						max: 0,
						min: 0,
						name: 'password',
						pattern: '',
						presentable: false,
						required: true,
						system: true,
						type: 'password'
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: true,
						id: 'text3866985172',
						max: 0,
						min: 0,
						name: 'sentTo',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: false,
						system: true,
						type: 'text'
					},
					{
						hidden: false,
						id: 'autodate2990389176',
						name: 'created',
						onCreate: true,
						onUpdate: false,
						presentable: false,
						system: true,
						type: 'autodate'
					},
					{
						hidden: false,
						id: 'autodate3332085495',
						name: 'updated',
						onCreate: true,
						onUpdate: true,
						presentable: false,
						system: true,
						type: 'autodate'
					}
				],
				id: 'pbc_1638494021',
				indexes: [
					'CREATE INDEX `idx_otps_collectionRef_recordRef` ON `_otps` (collectionRef, recordRef)'
				],
				listRule:
					"@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId",
				name: '_otps',
				system: true,
				type: 'base',
				updateRule: null,
				viewRule:
					"@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId"
			},
			{
				createRule: null,
				deleteRule:
					"@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId",
				fields: [
					{
						autogeneratePattern: '[a-z0-9]{15}',
						help: '',
						hidden: false,
						id: 'text3208210256',
						max: 15,
						min: 15,
						name: 'id',
						pattern: '^[a-z0-9]+$',
						presentable: false,
						primaryKey: true,
						required: true,
						system: true,
						type: 'text'
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: false,
						id: 'text455797646',
						max: 0,
						min: 0,
						name: 'collectionRef',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: true,
						system: true,
						type: 'text'
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: false,
						id: 'text127846527',
						max: 0,
						min: 0,
						name: 'recordRef',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: true,
						system: true,
						type: 'text'
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: false,
						id: 'text2462348188',
						max: 0,
						min: 0,
						name: 'provider',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: true,
						system: true,
						type: 'text'
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: false,
						id: 'text1044722854',
						max: 0,
						min: 0,
						name: 'providerId',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: true,
						system: true,
						type: 'text'
					},
					{
						hidden: false,
						id: 'autodate2990389176',
						name: 'created',
						onCreate: true,
						onUpdate: false,
						presentable: false,
						system: true,
						type: 'autodate'
					},
					{
						hidden: false,
						id: 'autodate3332085495',
						name: 'updated',
						onCreate: true,
						onUpdate: true,
						presentable: false,
						system: true,
						type: 'autodate'
					}
				],
				id: 'pbc_2281828961',
				indexes: [
					'CREATE UNIQUE INDEX `idx_externalAuths_record_provider` ON `_externalAuths` (collectionRef, recordRef, provider)',
					'CREATE UNIQUE INDEX `idx_externalAuths_collection_provider` ON `_externalAuths` (collectionRef, provider, providerId)'
				],
				listRule:
					"@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId",
				name: '_externalAuths',
				system: true,
				type: 'base',
				updateRule: null,
				viewRule:
					"@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId"
			},
			{
				createRule: null,
				deleteRule:
					"@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId",
				fields: [
					{
						autogeneratePattern: '[a-z0-9]{15}',
						help: '',
						hidden: false,
						id: 'text3208210256',
						max: 15,
						min: 15,
						name: 'id',
						pattern: '^[a-z0-9]+$',
						presentable: false,
						primaryKey: true,
						required: true,
						system: true,
						type: 'text'
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: false,
						id: 'text455797646',
						max: 0,
						min: 0,
						name: 'collectionRef',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: true,
						system: true,
						type: 'text'
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: false,
						id: 'text127846527',
						max: 0,
						min: 0,
						name: 'recordRef',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: true,
						system: true,
						type: 'text'
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: false,
						id: 'text4228609354',
						max: 0,
						min: 0,
						name: 'fingerprint',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: true,
						system: true,
						type: 'text'
					},
					{
						hidden: false,
						id: 'autodate2990389176',
						name: 'created',
						onCreate: true,
						onUpdate: false,
						presentable: false,
						system: true,
						type: 'autodate'
					},
					{
						hidden: false,
						id: 'autodate3332085495',
						name: 'updated',
						onCreate: true,
						onUpdate: true,
						presentable: false,
						system: true,
						type: 'autodate'
					}
				],
				id: 'pbc_4275539003',
				indexes: [
					'CREATE UNIQUE INDEX `idx_authOrigins_unique_pairs` ON `_authOrigins` (collectionRef, recordRef, fingerprint)'
				],
				listRule:
					"@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId",
				name: '_authOrigins',
				system: true,
				type: 'base',
				updateRule: null,
				viewRule:
					"@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId"
			},
			{
				authAlert: {
					emailTemplate: {
						body: "<p>Hello,</p>\n<p>We noticed a login to your {APP_NAME} account from a new location:</p>\n<p><em>{ALERT_INFO}</em></p>\n<p><strong>If this wasn't you, you should immediately change your {APP_NAME} account password to revoke access from all other locations.</strong></p>\n<p>If this was you, you may disregard this email.</p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
						subject: 'Login from a new location'
					},
					enabled: true
				},
				authRule: '',
				authToken: {
					duration: 86400
				},
				confirmEmailChangeTemplate: {
					body: '<p>Hello,</p>\n<p>Click on the button below to confirm your new email address.</p>\n<p>\n  <a class="btn" href="{APP_URL}/_/#/auth/confirm-email-change/{TOKEN}" target="_blank" rel="noopener">Confirm new email</a>\n</p>\n<p><i>If you didn\'t ask to change your email address, please ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>',
					subject: 'Confirm your {APP_NAME} new email address'
				},
				createRule: null,
				deleteRule: null,
				emailChangeToken: {
					duration: 1800
				},
				fields: [
					{
						autogeneratePattern: '[a-z0-9]{15}',
						help: '',
						hidden: false,
						id: 'text3208210256',
						max: 15,
						min: 15,
						name: 'id',
						pattern: '^[a-z0-9]+$',
						presentable: false,
						primaryKey: true,
						required: true,
						system: true,
						type: 'text'
					},
					{
						cost: 0,
						help: '',
						hidden: true,
						id: 'password901924565',
						max: 0,
						min: 8,
						name: 'password',
						pattern: '',
						presentable: false,
						required: true,
						system: true,
						type: 'password'
					},
					{
						autogeneratePattern: '[a-zA-Z0-9]{50}',
						help: '',
						hidden: true,
						id: 'text2504183744',
						max: 60,
						min: 30,
						name: 'tokenKey',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: true,
						system: true,
						type: 'text'
					},
					{
						exceptDomains: [],
						help: '',
						hidden: false,
						id: 'email3885137012',
						name: 'email',
						onlyDomains: [],
						presentable: false,
						required: true,
						system: true,
						type: 'email'
					},
					{
						help: '',
						hidden: false,
						id: 'bool1547992806',
						name: 'emailVisibility',
						presentable: false,
						required: false,
						system: true,
						type: 'bool'
					},
					{
						help: '',
						hidden: false,
						id: 'bool256245529',
						name: 'verified',
						presentable: false,
						required: false,
						system: true,
						type: 'bool'
					},
					{
						hidden: false,
						id: 'autodate2990389176',
						name: 'created',
						onCreate: true,
						onUpdate: false,
						presentable: false,
						system: true,
						type: 'autodate'
					},
					{
						hidden: false,
						id: 'autodate3332085495',
						name: 'updated',
						onCreate: true,
						onUpdate: true,
						presentable: false,
						system: true,
						type: 'autodate'
					}
				],
				fileToken: {
					duration: 180
				},
				id: 'pbc_3142635823',
				indexes: [
					'CREATE UNIQUE INDEX `idx_tokenKey_pbc_3142635823` ON `_superusers` (`tokenKey`)',
					"CREATE UNIQUE INDEX `idx_email_pbc_3142635823` ON `_superusers` (`email`) WHERE `email` != ''"
				],
				listRule: null,
				manageRule: null,
				mfa: {
					duration: 600,
					enabled: false,
					rule: ''
				},
				name: '_superusers',
				oauth2: {
					enabled: false,
					mappedFields: {
						avatarURL: '',
						id: '',
						name: '',
						username: ''
					}
				},
				otp: {
					duration: 180,
					emailTemplate: {
						body: "<p>Hello,</p>\n<p>Your one-time password is: <strong>{OTP}</strong></p>\n<p><i>If you didn't ask for the one-time password, you can ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
						subject: 'OTP for {APP_NAME}'
					},
					enabled: false,
					length: 8
				},
				passwordAuth: {
					enabled: true,
					identityFields: ['email']
				},
				passwordResetToken: {
					duration: 1800
				},
				resetPasswordTemplate: {
					body: '<p>Hello,</p>\n<p>Click on the button below to reset your password.</p>\n<p>\n  <a class="btn" href="{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}" target="_blank" rel="noopener">Reset password</a>\n</p>\n<p><i>If you didn\'t ask to reset your password, please ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>',
					subject: 'Reset your {APP_NAME} password'
				},
				system: true,
				type: 'auth',
				updateRule: null,
				verificationTemplate: {
					body: '<p>Hello,</p>\n<p>Thank you for joining us at {APP_NAME}.</p>\n<p>Click on the button below to verify your email address.</p>\n<p>\n  <a class="btn" href="{APP_URL}/_/#/auth/confirm-verification/{TOKEN}" target="_blank" rel="noopener">Verify</a>\n</p>\n<p><i>If you didn\'t recently register, please ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>',
					subject: 'Verify your {APP_NAME} email'
				},
				verificationToken: {
					duration: 86400
				},
				viewRule: null
			},
			{
				authAlert: {
					emailTemplate: {
						body: "<p>Hello,</p>\n<p>We noticed a login to your {APP_NAME} account from a new location:</p>\n<p><em>{ALERT_INFO}</em></p>\n<p><strong>If this wasn't you, you should immediately change your {APP_NAME} account password to revoke access from all other locations.</strong></p>\n<p>If this was you, you may disregard this email.</p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
						subject: 'Login from a new location'
					},
					enabled: true
				},
				authRule: '',
				authToken: {
					duration: 432000
				},
				confirmEmailChangeTemplate: {
					body: '<p>Hello,</p>\n<p>Click on the button below to confirm your new email address.</p>\n<p>\n  <a class="btn" href="{APP_URL}/_/#/auth/confirm-email-change/{TOKEN}" target="_blank" rel="noopener">Confirm new email</a>\n</p>\n<p><i>If you didn\'t ask to change your email address, please ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>',
					subject: 'Confirm your {APP_NAME} new email address'
				},
				createRule: '',
				deleteRule: null,
				emailChangeToken: {
					duration: 1800
				},
				fields: [
					{
						autogeneratePattern: '[a-z0-9]{15}',
						help: '',
						hidden: false,
						id: 'text3208210256',
						max: 15,
						min: 15,
						name: 'id',
						pattern: '^[a-z0-9]+$',
						presentable: false,
						primaryKey: true,
						required: true,
						system: true,
						type: 'text'
					},
					{
						cost: 0,
						help: '',
						hidden: true,
						id: 'password901924565',
						max: 0,
						min: 8,
						name: 'password',
						pattern: '',
						presentable: false,
						required: true,
						system: true,
						type: 'password'
					},
					{
						autogeneratePattern: '[a-zA-Z0-9]{50}',
						help: '',
						hidden: true,
						id: 'text2504183744',
						max: 60,
						min: 30,
						name: 'tokenKey',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: true,
						system: true,
						type: 'text'
					},
					{
						exceptDomains: [],
						help: '',
						hidden: false,
						id: 'email3885137012',
						name: 'email',
						onlyDomains: [],
						presentable: false,
						required: true,
						system: true,
						type: 'email'
					},
					{
						help: '',
						hidden: false,
						id: 'bool1547992806',
						name: 'emailVisibility',
						presentable: false,
						required: false,
						system: true,
						type: 'bool'
					},
					{
						help: '',
						hidden: false,
						id: 'bool256245529',
						name: 'verified',
						presentable: false,
						required: false,
						system: true,
						type: 'bool'
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: false,
						id: 'text1579384326',
						max: 255,
						min: 0,
						name: 'name',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: false,
						system: false,
						type: 'text'
					},
					{
						help: '',
						hidden: false,
						id: 'file376926767',
						maxSelect: 1,
						maxSize: 0,
						mimeTypes: ['image/jpeg', 'image/png', 'image/svg+xml', 'image/gif', 'image/webp'],
						name: 'avatar',
						presentable: false,
						protected: false,
						required: false,
						system: false,
						thumbs: [],
						type: 'file'
					},
					{
						hidden: false,
						id: 'autodate2990389176',
						name: 'created',
						onCreate: true,
						onUpdate: false,
						presentable: false,
						system: false,
						type: 'autodate'
					},
					{
						hidden: false,
						id: 'autodate3332085495',
						name: 'updated',
						onCreate: true,
						onUpdate: true,
						presentable: false,
						system: false,
						type: 'autodate'
					}
				],
				fileToken: {
					duration: 180
				},
				id: '_pb_users_auth_',
				indexes: [
					'CREATE UNIQUE INDEX `idx_tokenKey__pb_users_auth_` ON `users` (`tokenKey`)',
					"CREATE UNIQUE INDEX `idx_email__pb_users_auth_` ON `users` (`email`) WHERE `email` != ''"
				],
				listRule:
					'id = @request.auth.id || (@collection.memberships.user.id ?= id && @collection.memberships.organization.memberships_via_organization.user.id ?= @request.auth.id)',
				manageRule: null,
				mfa: {
					duration: 600,
					enabled: false,
					rule: ''
				},
				name: 'users',
				oauth2: {
					enabled: false,
					mappedFields: {
						avatarURL: 'avatar',
						id: '',
						name: 'name',
						username: ''
					}
				},
				otp: {
					duration: 180,
					emailTemplate: {
						body: "<p>Hello,</p>\n<p>Your one-time password is: <strong>{OTP}</strong></p>\n<p><i>If you didn't ask for the one-time password, you can ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
						subject: 'OTP for {APP_NAME}'
					},
					enabled: false,
					length: 8
				},
				passwordAuth: {
					enabled: true,
					identityFields: ['email']
				},
				passwordResetToken: {
					duration: 1800
				},
				resetPasswordTemplate: {
					body: '<p>Hello,</p>\n<p>Click on the button below to reset your password.</p>\n<p>\n  <a class="btn" href="{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}" target="_blank" rel="noopener">Reset password</a>\n</p>\n<p><i>If you didn\'t ask to reset your password, please ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>',
					subject: 'Reset your {APP_NAME} password'
				},
				system: false,
				type: 'auth',
				updateRule: 'id = @request.auth.id',
				verificationTemplate: {
					body: '<p>Hello,</p>\n<p>Please click the button below to verify your email address for {APP_NAME}.</p>\n<p>\n  <a class="btn" href="{APP_URL}/auth/confirm-verification?token={TOKEN}" target="_blank" rel="noopener">Verify email</a>\n</p>\n<p>Thanks,<br/>The {APP_NAME} team</p>',
					subject: 'Verify your {APP_NAME} email'
				},
				verificationToken: {
					duration: 86400
				},
				viewRule:
					'id = @request.auth.id || (@collection.memberships.user.id ?= id && @collection.memberships.organization.memberships_via_organization.user.id ?= @request.auth.id)'
			},
			{
				createRule: null,
				deleteRule: null,
				fields: [
					{
						autogeneratePattern: '[a-z0-9]{15}',
						help: '',
						hidden: false,
						id: 'text3208210256',
						max: 15,
						min: 15,
						name: 'id',
						pattern: '^[a-z0-9]+$',
						presentable: false,
						primaryKey: true,
						required: true,
						system: true,
						type: 'text'
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: false,
						id: 'text1579384326',
						max: 120,
						min: 2,
						name: 'name',
						pattern: '',
						presentable: true,
						primaryKey: false,
						required: true,
						system: false,
						type: 'text'
					},
					{
						hidden: false,
						id: 'autodate2990389176',
						name: 'created',
						onCreate: true,
						onUpdate: false,
						presentable: false,
						system: false,
						type: 'autodate'
					},
					{
						hidden: false,
						id: 'autodate3332085495',
						name: 'updated',
						onCreate: true,
						onUpdate: true,
						presentable: false,
						system: false,
						type: 'autodate'
					}
				],
				id: 'pbc_2873630990',
				indexes: [],
				listRule:
					'(@collection.memberships.organization.id ?= id && @collection.memberships.user.id ?= @request.auth.id)',
				name: 'organizations',
				system: false,
				type: 'base',
				updateRule:
					"(@collection.memberships.organization.id ?= id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin'))",
				viewRule:
					'(@collection.memberships.organization.id ?= id && @collection.memberships.user.id ?= @request.auth.id)'
			},
			{
				createRule: null,
				deleteRule: null,
				fields: [
					{
						autogeneratePattern: '[a-z0-9]{15}',
						help: '',
						hidden: false,
						id: 'text3208210256',
						max: 15,
						min: 15,
						name: 'id',
						pattern: '^[a-z0-9]+$',
						presentable: false,
						primaryKey: true,
						required: true,
						system: true,
						type: 'text'
					},
					{
						cascadeDelete: true,
						collectionId: 'pbc_2873630990',
						help: '',
						hidden: false,
						id: 'relation3253625724',
						maxSelect: 1,
						minSelect: 0,
						name: 'organization',
						presentable: false,
						required: true,
						system: false,
						type: 'relation'
					},
					{
						cascadeDelete: true,
						collectionId: '_pb_users_auth_',
						help: '',
						hidden: false,
						id: 'relation2375276105',
						maxSelect: 1,
						minSelect: 0,
						name: 'user',
						presentable: false,
						required: true,
						system: false,
						type: 'relation'
					},
					{
						help: '',
						hidden: false,
						id: 'select1466534506',
						maxSelect: 1,
						name: 'role',
						presentable: false,
						required: true,
						system: false,
						type: 'select',
						values: ['owner', 'admin', 'scorekeeper', 'viewer']
					},
					{
						hidden: false,
						id: 'autodate2990389176',
						name: 'created',
						onCreate: true,
						onUpdate: false,
						presentable: false,
						system: false,
						type: 'autodate'
					},
					{
						hidden: false,
						id: 'autodate3332085495',
						name: 'updated',
						onCreate: true,
						onUpdate: true,
						presentable: false,
						system: false,
						type: 'autodate'
					}
				],
				id: 'pbc_1990943746',
				indexes: [
					'CREATE UNIQUE INDEX idx_memberships_org_user ON memberships (organization, user)'
				],
				listRule:
					'user.id = @request.auth.id || (@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id)',
				name: 'memberships',
				system: false,
				type: 'base',
				updateRule: null,
				viewRule:
					'user.id = @request.auth.id || (@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id)'
			},
			{
				createRule: null,
				deleteRule: null,
				fields: [
					{
						autogeneratePattern: '[a-z0-9]{15}',
						help: '',
						hidden: false,
						id: 'text3208210256',
						max: 15,
						min: 15,
						name: 'id',
						pattern: '^[a-z0-9]+$',
						presentable: false,
						primaryKey: true,
						required: true,
						system: true,
						type: 'text'
					},
					{
						cascadeDelete: true,
						collectionId: 'pbc_2873630990',
						help: '',
						hidden: false,
						id: 'relation3253625724',
						maxSelect: 1,
						minSelect: 0,
						name: 'organization',
						presentable: false,
						required: true,
						system: false,
						type: 'relation'
					},
					{
						exceptDomains: [],
						help: '',
						hidden: false,
						id: 'email3885137012',
						name: 'email',
						onlyDomains: [],
						presentable: false,
						required: true,
						system: false,
						type: 'email'
					},
					{
						help: '',
						hidden: false,
						id: 'select1466534506',
						maxSelect: 1,
						name: 'role',
						presentable: false,
						required: true,
						system: false,
						type: 'select',
						values: ['admin', 'scorekeeper', 'viewer']
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: true,
						id: 'text3015464922',
						max: 128,
						min: 0,
						name: 'token_hash',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: true,
						system: false,
						type: 'text'
					},
					{
						help: '',
						hidden: false,
						id: 'select2063623452',
						maxSelect: 1,
						name: 'status',
						presentable: false,
						required: true,
						system: false,
						type: 'select',
						values: ['pending', 'accepted', 'revoked']
					},
					{
						help: '',
						hidden: false,
						id: 'date261981154',
						max: '',
						min: '',
						name: 'expires_at',
						presentable: false,
						required: true,
						system: false,
						type: 'date'
					},
					{
						cascadeDelete: false,
						collectionId: '_pb_users_auth_',
						help: '',
						hidden: false,
						id: 'relation1109389909',
						maxSelect: 1,
						minSelect: 0,
						name: 'invited_by',
						presentable: false,
						required: true,
						system: false,
						type: 'relation'
					},
					{
						cascadeDelete: false,
						collectionId: '_pb_users_auth_',
						help: '',
						hidden: false,
						id: 'relation3176659580',
						maxSelect: 1,
						minSelect: 0,
						name: 'accepted_by',
						presentable: false,
						required: false,
						system: false,
						type: 'relation'
					},
					{
						help: '',
						hidden: false,
						id: 'date3905672450',
						max: '',
						min: '',
						name: 'accepted_at',
						presentable: false,
						required: false,
						system: false,
						type: 'date'
					},
					{
						hidden: false,
						id: 'autodate2990389176',
						name: 'created',
						onCreate: true,
						onUpdate: false,
						presentable: false,
						system: false,
						type: 'autodate'
					},
					{
						hidden: false,
						id: 'autodate3332085495',
						name: 'updated',
						onCreate: true,
						onUpdate: true,
						presentable: false,
						system: false,
						type: 'autodate'
					}
				],
				id: 'pbc_3554030554',
				indexes: [
					'CREATE UNIQUE INDEX idx_invitations_token_hash ON invitations (token_hash)',
					'CREATE INDEX idx_invitations_org_email ON invitations (organization, email)'
				],
				listRule:
					"(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin'))",
				name: 'invitations',
				system: false,
				type: 'base',
				updateRule: null,
				viewRule:
					"(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin'))"
			},
			{
				createRule: null,
				deleteRule: null,
				fields: [
					{
						autogeneratePattern: '[a-z0-9]{15}',
						help: '',
						hidden: false,
						id: 'text3208210256',
						max: 15,
						min: 15,
						name: 'id',
						pattern: '^[a-z0-9]+$',
						presentable: false,
						primaryKey: true,
						required: true,
						system: true,
						type: 'text'
					},
					{
						cascadeDelete: true,
						collectionId: 'pbc_2873630990',
						help: '',
						hidden: false,
						id: 'relation3253625724',
						maxSelect: 1,
						minSelect: 0,
						name: 'organization',
						presentable: false,
						required: true,
						system: false,
						type: 'relation'
					},
					{
						cascadeDelete: false,
						collectionId: '_pb_users_auth_',
						help: '',
						hidden: false,
						id: 'relation1148540665',
						maxSelect: 1,
						minSelect: 0,
						name: 'actor',
						presentable: false,
						required: true,
						system: false,
						type: 'relation'
					},
					{
						help: '',
						hidden: false,
						id: 'select1204587666',
						maxSelect: 1,
						name: 'action',
						presentable: false,
						required: true,
						system: false,
						type: 'select',
						values: [
							'organization_created',
							'invitation_created',
							'invitation_accepted',
							'invitation_revoked',
							'role_changed',
							'member_removed',
							'member_left',
							'ownership_transferred'
						]
					},
					{
						cascadeDelete: false,
						collectionId: '_pb_users_auth_',
						help: '',
						hidden: false,
						id: 'relation525947538',
						maxSelect: 1,
						minSelect: 0,
						name: 'subject_user',
						presentable: false,
						required: false,
						system: false,
						type: 'relation'
					},
					{
						autogeneratePattern: '',
						help: '',
						hidden: false,
						id: 'text4127309228',
						max: 254,
						min: 0,
						name: 'subject_email',
						pattern: '',
						presentable: false,
						primaryKey: false,
						required: false,
						system: false,
						type: 'text'
					},
					{
						help: '',
						hidden: false,
						id: 'json1915095946',
						maxSize: 10000,
						name: 'details',
						presentable: false,
						required: false,
						system: false,
						type: 'json'
					},
					{
						hidden: false,
						id: 'autodate2990389176',
						name: 'created',
						onCreate: true,
						onUpdate: false,
						presentable: false,
						system: false,
						type: 'autodate'
					},
					{
						hidden: false,
						id: 'autodate3332085495',
						name: 'updated',
						onCreate: true,
						onUpdate: true,
						presentable: false,
						system: false,
						type: 'autodate'
					}
				],
				id: 'pbc_2968977090',
				indexes: [],
				listRule:
					"(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin'))",
				name: 'membership_events',
				system: false,
				type: 'base',
				updateRule: null,
				viewRule:
					"(@collection.memberships.organization.id ?= organization.id && @collection.memberships.user.id ?= @request.auth.id && (@collection.memberships.role ?= 'owner' || @collection.memberships.role ?= 'admin'))"
			}
		];

		return app.importCollections(snapshot, false);
	},
	(app) => {
		return null;
	}
);
