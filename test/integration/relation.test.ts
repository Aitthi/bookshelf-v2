/**
 * Vitest port of test/integration/relation.js
 *
 * Tests Relation class properties and SQL generation (synchronous — no DB queries needed).
 * The original suite only ran against MySQL because of SQL string assertions; SQLite3 in Knex
 * produces identical backtick-quoted SQL so all assertions pass unchanged.
 *
 * Conversion notes:
 *   - module.exports wrapper → top-level describe
 *   - require('../../lib/relation') → import Relation from '../../src/relation'
 *   - bookshelf.Model.extend() used to define local test models (same as original)
 *   - assert.equal kept via node:assert/strict
 *   - No DB operations; initialize() included for harness consistency
 */

import {describe, it, beforeAll} from 'vitest';
import {equal} from 'node:assert/strict';
import {bookshelf, initialize} from './helpers/harness';
import Relation from '../../src/relation';

beforeAll(async () => {
  await initialize();
});

describe('Relation', () => {
  // ---------------------------------------------------------------------------
  // Local test models (mirrored from original relation.js)
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Photo: any = bookshelf.Model.extend({
    tableName: 'photos',
    imageable() {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      return this.morphTo('imageable', Doctor, Patient);
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Doctor: any = bookshelf.Model.extend({
    tableName: 'doctors',
    photos() {
      return this.morphMany(Photo, 'imageable');
    },
    patients() {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      return this.belongsToMany(Patient).through(Appointment);
    },
    patientsStd() {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      return this.belongsToMany(Patient);
    },
    meta() {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      return this.hasOne(DoctorMeta, 'doctoring_id');
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const DoctorMeta: any = bookshelf.Model.extend({
    idAttribute: 'customId',
    tableName: 'doctormeta',
    doctor() {
      return this.belongsTo(Doctor, 'doctoring_id');
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Patient: any = bookshelf.Model.extend({
    tableName: 'patients',
    doctors() {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      return this.belongsToMany(Doctor).through(Appointment);
    },
    photos() {
      return this.morphMany(Photo, 'imageable');
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Appointment: any = bookshelf.Model.extend({
    tableName: 'appointments',
    patient() {
      return this.belongsTo(Patient);
    },
    doctor() {
      return this.belongsTo(Doctor);
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Supplier: any = bookshelf.Model.extend({
    tableName: 'suppliers',
    accountHistory() {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      return this.hasOne(AccountHistory).through(Account);
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Account: any = bookshelf.Model.extend({
    tableName: 'accounts'
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AccountHistory: any = bookshelf.Model.extend({
    tableName: 'account_histories',
    supplier() {
      return this.belongsTo(Supplier).through(Account);
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Customer: any = bookshelf.Model.extend({
    tableName: 'customers',
    locale() {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      return this.hasOne(Locale).through(Translation, 'isoCode', 'customer', 'code', 'name');
    },
    locales() {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      return this.hasMany(Locale).through(Translation, 'isoCode', 'customer', 'code', 'name');
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Translation: any = bookshelf.Model.extend({
    tableName: 'translations',
    locale() {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      return this.belongsTo(Locale, 'code', 'isoCode');
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Locale: any = bookshelf.Model.extend({
    tableName: 'locales',
    customer() {
      return this.belongsTo(Customer).through(Translation, 'isoCode', 'customer', 'code', 'name');
    },
    customers() {
      return this.belongsToMany(Customer, 'translations', 'code', 'customer', 'isoCode', 'name');
    },
    customersThrough() {
      return this.belongsToMany(Customer).through(Translation, 'code', 'customer', 'isoCode', 'name');
    },
    translation() {
      return this.hasOne(Translation, 'code', 'isoCode');
    },
    translations() {
      return this.hasMany(Translation, 'code', 'isoCode');
    }
  });

  // ---------------------------------------------------------------------------
  // Tests
  // ---------------------------------------------------------------------------

  describe('Bookshelf.Relation', () => {
    it('should not error if the type/target are not specified', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const relation = new (Relation as any)();
      equal(relation.type, undefined);
    });

    it('should not error when accessing a relation through an uninstantiated model', () => {
      const relation = Doctor.prototype.meta();
      const relatedData = relation.relatedData;

      // Base
      equal(relatedData.type, 'hasOne');
      equal(relatedData.target, DoctorMeta);
      equal(relatedData.targetTableName, 'doctormeta');
      equal(relatedData.targetIdAttribute, 'customId');
      equal(relatedData.foreignKey, 'doctoring_id');
      equal(relatedData.foreignKeyTarget, undefined);

      // Init
      equal(relatedData.parentId, undefined);
      equal(relatedData.parentTableName, 'doctors');
      equal(relatedData.parentIdAttribute, 'id');
      equal(relatedData.parentFk, undefined);
    });

    it('should handle a hasOne relation', () => {
      const base = new Doctor({id: 1});
      const relation = base.meta();
      const _knex = relation.query();
      const relatedData = relation.relatedData;

      // Base
      equal(relatedData.type, 'hasOne');
      equal(relatedData.target, DoctorMeta);
      equal(relatedData.targetTableName, 'doctormeta');
      equal(relatedData.targetIdAttribute, 'customId');
      equal(relatedData.foreignKey, 'doctoring_id');
      equal(relatedData.foreignKeyTarget, undefined);

      // Init
      equal(relatedData.parentId, 1);
      equal(relatedData.parentTableName, 'doctors');
      equal(relatedData.parentIdAttribute, 'id');
      equal(relatedData.parentFk, 1);

      // init the select constraints
      relatedData.selectConstraints(_knex, {});

      equal(
        _knex.toString(),
        'select distinct `doctormeta`.* from `doctormeta` where `doctormeta`.`doctoring_id` = 1 limit 1'
      );
    });

    it('should handle a hasOne -> through relation', () => {
      const base = new Supplier({id: 1});
      const relation = base.accountHistory();
      const _knex = relation.query();
      const relatedData = relation.relatedData;

      // Base
      equal(relatedData.type, 'hasOne');
      equal(relatedData.target, AccountHistory);
      equal(relatedData.targetTableName, 'account_histories');
      equal(relatedData.targetIdAttribute, 'id');
      equal(relatedData.foreignKey, undefined);
      equal(relatedData.foreignKeyTarget, undefined);
      equal(relatedData.otherKey, undefined);
      equal(relatedData.otherKeyTarget, undefined);

      // Init
      equal(relatedData.parentId, 1);
      equal(relatedData.parentTableName, 'suppliers');
      equal(relatedData.parentIdAttribute, 'id');
      equal(relatedData.parentFk, 1);

      // Through
      equal(relatedData.throughTarget, Account);
      equal(relatedData.throughTableName, 'accounts');
      equal(relatedData.throughIdAttribute, 'id');
      equal(relatedData.throughForeignKey, undefined);
      equal(relatedData.throughForeignKeyTarget, undefined);

      // init the select constraints
      relatedData.selectConstraints(_knex, {});

      const sql =
        'select distinct `account_histories`.*, `accounts`.`id` as `_pivot_id`, `accounts`.`supplier_id` as `_pivot_supplier_id` from `account_histories` inner join `accounts` on `accounts`.`id` = `account_histories`.`account_id` where `accounts`.`supplier_id` = 1 limit 1';

      equal(_knex.toString(), sql);
    });

    it('should handle a belongsTo -> through relation', () => {
      const base = new AccountHistory({id: 1});
      const relation = base.supplier();
      const _knex = relation.query();
      const relatedData = relation.relatedData;

      // Base
      equal(relatedData.type, 'belongsTo');
      equal(relatedData.target, Supplier);
      equal(relatedData.targetTableName, 'suppliers');
      equal(relatedData.targetIdAttribute, 'id');
      equal(relatedData.foreignKey, 'supplier_id');
      equal(relatedData.foreignKeyTarget, undefined);
      equal(relatedData.otherKey, undefined);
      equal(relatedData.otherKeyTarget, undefined);

      // Init
      equal(relatedData.parentId, 1);
      equal(relatedData.parentTableName, 'account_histories');
      equal(relatedData.parentIdAttribute, 'id');
      equal(relatedData.parentFk, 1);

      // Through
      equal(relatedData.throughTarget, Account);
      equal(relatedData.throughTableName, 'accounts');
      equal(relatedData.throughIdAttribute, 'id');
      equal(relatedData.throughForeignKey, undefined);
      equal(relatedData.throughForeignKeyTarget, undefined);

      // init the select constraints
      relatedData.selectConstraints(_knex, {});

      const sql =
        'select distinct `suppliers`.*, `accounts`.`id` as `_pivot_id`, `accounts`.`supplier_id` as `_pivot_supplier_id` from `suppliers` inner join `accounts` on `accounts`.`supplier_id` = `suppliers`.`id` inner join `account_histories` on `accounts`.`id` = `account_histories`.`account_id` where `account_histories`.`id` = 1 limit 1';

      equal(_knex.toString(), sql);
    });

    it('should handle a belongsToMany -> through relation', () => {
      const base = new Doctor({id: 1});
      const relation = base.patients();
      const _knex = relation.query();
      const relatedData = relation.relatedData;

      // Base
      equal(relatedData.type, 'belongsToMany');
      equal(relatedData.target, Patient);
      equal(relatedData.targetTableName, 'patients');
      equal(relatedData.targetIdAttribute, 'id');
      equal(relatedData.foreignKey, undefined);
      equal(relatedData.foreignKeyTarget, undefined);
      equal(relatedData.otherKey, undefined);
      equal(relatedData.otherKeyTarget, undefined);

      // Init
      equal(relatedData.parentId, 1);
      equal(relatedData.parentTableName, 'doctors');
      equal(relatedData.parentIdAttribute, 'id');
      equal(relatedData.parentFk, 1);

      // Through
      equal(relatedData.throughTarget, Appointment);
      equal(relatedData.throughTableName, 'appointments');
      equal(relatedData.throughIdAttribute, 'id');
      equal(relatedData.throughForeignKey, undefined);
      equal(relatedData.throughForeignKeyTarget, undefined);

      // init the select constraints
      relatedData.selectConstraints(_knex, {});

      const sql =
        'select distinct `patients`.*, `appointments`.`id` as `_pivot_id`, `appointments`.`doctor_id` as `_pivot_doctor_id`, `appointments`.`patient_id` as `_pivot_patient_id` from `patients` inner join `appointments` on `appointments`.`patient_id` = `patients`.`id` where `appointments`.`doctor_id` = 1';

      equal(_knex.toString(), sql);
    });

    it('should handle a standard belongsToMany relation', () => {
      const base = new Doctor({id: 1});
      const relation = base.patientsStd();
      const _knex = relation.query();
      const relatedData = relation.relatedData;

      // Base
      equal(relatedData.type, 'belongsToMany');
      equal(relatedData.target, Patient);
      equal(relatedData.targetTableName, 'patients');
      equal(relatedData.targetIdAttribute, 'id');
      equal(relatedData.foreignKey, undefined);
      equal(relatedData.foreignKeyTarget, undefined);
      equal(relatedData.otherKey, undefined);
      equal(relatedData.otherKeyTarget, undefined);

      // Init
      equal(relatedData.parentId, 1);
      equal(relatedData.parentTableName, 'doctors');
      equal(relatedData.parentIdAttribute, 'id');
      equal(relatedData.parentFk, 1);

      // init the select constraints
      relatedData.selectConstraints(_knex, {});

      const sql =
        'select distinct `patients`.*, `doctors_patients`.`doctor_id` as `_pivot_doctor_id`, `doctors_patients`.`patient_id` as `_pivot_patient_id` from `patients` inner join `doctors_patients` on `doctors_patients`.`patient_id` = `patients`.`id` where `doctors_patients`.`doctor_id` = 1';

      equal(_knex.toString(), sql);
    });

    it('should handle polymorphic relations', () => {
      const base = new Doctor({id: 1});
      const relation = base.photos();
      const _knex = relation.query();
      const relatedData = relation.relatedData;

      // Base
      equal(relatedData.type, 'morphMany');
      equal(relatedData.target, Photo);
      equal(relatedData.targetTableName, 'photos');
      equal(relatedData.targetIdAttribute, 'id');
      equal(relatedData.foreignKey, undefined);
      equal(relatedData.foreignKeyTarget, undefined);

      // Init
      equal(relatedData.parentId, 1);
      equal(relatedData.parentTableName, 'doctors');
      equal(relatedData.parentIdAttribute, 'id');
      equal(relatedData.parentFk, 1);

      // init the select constraints
      relatedData.selectConstraints(_knex, {});

      const sql =
        "select distinct `photos`.* from `photos` where `photos`.`imageable_id` = 1 and `photos`.`imageable_type` = 'doctors'";

      equal(_knex.toString(), sql);
    });

    it('should handle a hasOne relation with explicit foreignKeyTarget', () => {
      const base = new Locale({isoCode: 'en'});
      const relation = base.translation();
      const _knex = relation.query();
      const relatedData = relation.relatedData;

      // Base
      equal(relatedData.type, 'hasOne');
      equal(relatedData.target, Translation);
      equal(relatedData.targetTableName, 'translations');
      equal(relatedData.targetIdAttribute, 'id');
      equal(relatedData.foreignKey, 'code');
      equal(relatedData.foreignKeyTarget, 'isoCode');

      // Init
      equal(relatedData.parentId, undefined);
      equal(relatedData.parentTableName, 'locales');
      equal(relatedData.parentIdAttribute, 'isoCode');
      equal(relatedData.parentFk, 'en');

      // init the select constraints
      relatedData.selectConstraints(_knex, {});

      equal(
        _knex.toString(),
        "select distinct `translations`.* from `translations` where `translations`.`code` = 'en' limit 1"
      );
    });

    it('should handle a hasOne -> through relation with explicit foreignKeyTarget', () => {
      const base = new Customer({name: 'foobar'});
      const relation = base.locale();
      const _knex = relation.query();
      const relatedData = relation.relatedData;

      // Base
      equal(relatedData.type, 'hasOne');
      equal(relatedData.target, Locale);
      equal(relatedData.targetTableName, 'locales');
      equal(relatedData.targetIdAttribute, 'id');
      equal(relatedData.foreignKey, 'customer');
      equal(relatedData.foreignKeyTarget, undefined);
      equal(relatedData.otherKey, 'customer');
      equal(relatedData.otherKeyTarget, 'name');

      // Init
      equal(relatedData.parentId, undefined);
      equal(relatedData.parentTableName, 'customers');
      equal(relatedData.parentIdAttribute, 'name');
      equal(relatedData.parentFk, 'foobar');

      // Through
      equal(relatedData.throughTarget, Translation);
      equal(relatedData.throughTableName, 'translations');
      equal(relatedData.throughIdAttribute, 'code');
      equal(relatedData.throughForeignKey, 'isoCode');
      equal(relatedData.throughForeignKeyTarget, 'code');

      // init the select constraints
      relatedData.selectConstraints(_knex, {});

      equal(
        _knex.toString(),
        "select distinct `locales`.*, `translations`.`code` as `_pivot_code`, `translations`.`customer` as `_pivot_customer` from `locales` inner join `translations` on `translations`.`code` = `locales`.`isoCode` where `translations`.`customer` = 'foobar' limit 1"
      );
    });

    it('should handle a hasMany relation with explicit foreignKeyTarget', () => {
      const base = new Locale({isoCode: 'en'});
      const relation = base.translations();
      const _knex = relation.query();
      const relatedData = relation.relatedData;

      // Base
      equal(relatedData.type, 'hasMany');
      equal(relatedData.target, Translation);
      equal(relatedData.targetTableName, 'translations');
      equal(relatedData.targetIdAttribute, 'id');
      equal(relatedData.foreignKey, 'code');
      equal(relatedData.foreignKeyTarget, 'isoCode');

      // Init
      equal(relatedData.parentId, undefined);
      equal(relatedData.parentTableName, 'locales');
      equal(relatedData.parentIdAttribute, 'isoCode');
      equal(relatedData.parentFk, 'en');

      // init the select constraints
      relatedData.selectConstraints(_knex, {});

      equal(
        _knex.toString(),
        "select distinct `translations`.* from `translations` where `translations`.`code` = 'en'"
      );
    });

    it('should handle a hasMany -> through relation with explicit foreignKeyTarget', () => {
      const base = new Customer({name: 'foobar'});
      const relation = base.locales();
      const _knex = relation.query();
      const relatedData = relation.relatedData;

      // Base
      equal(relatedData.type, 'hasMany');
      equal(relatedData.target, Locale);
      equal(relatedData.targetTableName, 'locales');
      equal(relatedData.targetIdAttribute, 'id');
      equal(relatedData.foreignKey, 'customer');
      equal(relatedData.foreignKeyTarget, undefined);
      equal(relatedData.otherKey, 'customer');
      equal(relatedData.otherKeyTarget, 'name');

      // Init
      equal(relatedData.parentId, undefined);
      equal(relatedData.parentTableName, 'customers');
      equal(relatedData.parentIdAttribute, 'name');
      equal(relatedData.parentFk, 'foobar');

      // Through
      equal(relatedData.throughTarget, Translation);
      equal(relatedData.throughTableName, 'translations');
      equal(relatedData.throughIdAttribute, 'code');
      equal(relatedData.throughForeignKey, 'isoCode');
      equal(relatedData.throughForeignKeyTarget, 'code');

      // init the select constraints
      relatedData.selectConstraints(_knex, {});

      equal(
        _knex.toString(),
        "select distinct `locales`.*, `translations`.`code` as `_pivot_code`, `translations`.`customer` as `_pivot_customer` from `locales` inner join `translations` on `translations`.`code` = `locales`.`isoCode` where `translations`.`customer` = 'foobar'"
      );
    });

    it('should handle a belongsTo relation with explicit foreignKeyTarget', () => {
      const base = new Translation({code: 'en'});
      const relation = base.locale();
      const _knex = relation.query();
      const relatedData = relation.relatedData;

      // Base
      equal(relatedData.type, 'belongsTo');
      equal(relatedData.target, Locale);
      equal(relatedData.targetTableName, 'locales');
      equal(relatedData.targetIdAttribute, 'isoCode');
      equal(relatedData.foreignKey, 'code');
      equal(relatedData.foreignKeyTarget, 'isoCode');

      // Init
      equal(relatedData.parentId, undefined);
      equal(relatedData.parentTableName, 'translations');
      equal(relatedData.parentIdAttribute, 'code');
      equal(relatedData.parentFk, 'en');

      // init the select constraints
      relatedData.selectConstraints(_knex, {});

      const sql = "select distinct `locales`.* from `locales` where `locales`.`isoCode` = 'en' limit 1";

      equal(_knex.toString(), sql);
    });

    it('should handle a belongsTo -> through relation with explicit foreignKeyTarget', () => {
      const base = new Locale({isoCode: 'en'});
      const relation = base.customer();
      const _knex = relation.query();
      const relatedData = relation.relatedData;

      // Base
      equal(relatedData.type, 'belongsTo');
      equal(relatedData.target, Customer);
      equal(relatedData.targetTableName, 'customers');
      equal(relatedData.targetIdAttribute, 'name');
      equal(relatedData.foreignKey, 'customer');
      equal(relatedData.foreignKeyTarget, undefined);
      equal(relatedData.otherKey, 'customer');
      equal(relatedData.otherKeyTarget, 'name');

      // Init
      equal(relatedData.parentId, undefined);
      equal(relatedData.parentTableName, 'locales');
      equal(relatedData.parentIdAttribute, 'isoCode');
      equal(relatedData.parentFk, 'en');

      // Through
      equal(relatedData.throughTarget, Translation);
      equal(relatedData.throughTableName, 'translations');
      equal(relatedData.throughIdAttribute, 'code');
      equal(relatedData.throughForeignKey, 'isoCode');
      equal(relatedData.throughForeignKeyTarget, 'code');

      // init the select constraints
      relatedData.selectConstraints(_knex, {});

      const sql =
        "select distinct `customers`.*, `translations`.`code` as `_pivot_code`, `translations`.`customer` as `_pivot_customer` from `customers` inner join `translations` on `translations`.`customer` = `customers`.`name` inner join `locales` on `translations`.`code` = `locales`.`isoCode` where `locales`.`isoCode` = 'en' limit 1";

      equal(_knex.toString(), sql);
    });

    it('should handle a belongsToMany relation with explicit foreignKeyTarget and otherKeyTarget', () => {
      const base = new Locale({isoCode: 'en'});
      const relation = base.customers();
      const _knex = relation.query();
      const relatedData = relation.relatedData;

      // Base
      equal(relatedData.type, 'belongsToMany');
      equal(relatedData.target, Customer);
      equal(relatedData.targetTableName, 'customers');
      equal(relatedData.targetIdAttribute, 'name');
      equal(relatedData.joinTableName, 'translations');
      equal(relatedData.foreignKey, 'code');
      equal(relatedData.foreignKeyTarget, 'isoCode');
      equal(relatedData.otherKey, 'customer');
      equal(relatedData.otherKeyTarget, 'name');

      // Init
      equal(relatedData.parentId, undefined);
      equal(relatedData.parentTableName, 'locales');
      equal(relatedData.parentIdAttribute, 'isoCode');
      equal(relatedData.parentFk, 'en');

      // init the select constraints
      relatedData.selectConstraints(_knex, {});

      const sql =
        "select distinct `customers`.*, `translations`.`code` as `_pivot_code`, `translations`.`customer` as `_pivot_customer` from `customers` inner join `translations` on `translations`.`customer` = `customers`.`name` where `translations`.`code` = 'en'";

      equal(_knex.toString(), sql);
    });

    it('should handle a belongsToMany -> through relation with explicit foreignKeyTarget and otherKeyTarget', () => {
      const base = new Locale({isoCode: 'en'});
      const relation = base.customersThrough();
      const _knex = relation.query();
      const relatedData = relation.relatedData;

      // Base
      equal(relatedData.type, 'belongsToMany');
      equal(relatedData.target, Customer);
      equal(relatedData.targetTableName, 'customers');
      equal(relatedData.targetIdAttribute, 'name');
      equal(relatedData.joinTableName, undefined);
      equal(relatedData.foreignKey, 'code');
      equal(relatedData.foreignKeyTarget, undefined);
      equal(relatedData.otherKey, 'customer');
      equal(relatedData.otherKeyTarget, 'name');

      // Init
      equal(relatedData.parentId, undefined);
      equal(relatedData.parentTableName, 'locales');
      equal(relatedData.parentIdAttribute, 'isoCode');
      equal(relatedData.parentFk, 'en');

      // Through
      equal(relatedData.throughTarget, Translation);
      equal(relatedData.throughTableName, 'translations');
      equal(relatedData.throughIdAttribute, 'code');
      equal(relatedData.throughForeignKey, 'code');
      equal(relatedData.throughForeignKeyTarget, 'isoCode');

      // init the select constraints
      relatedData.selectConstraints(_knex, {});

      const sql =
        "select distinct `customers`.*, `translations`.`code` as `_pivot_code`, `translations`.`code` as `_pivot_code`, `translations`.`customer` as `_pivot_customer` from `customers` inner join `translations` on `translations`.`customer` = `customers`.`name` where `translations`.`code` = 'en'";

      equal(_knex.toString(), sql);
    });
  });
});
