using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace EnglishReadingPlatform.Migrations
{
    /// <inheritdoc />
    public partial class AddDailyStreakAndGoal : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GunlukEtkinlikler",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    Gun = table.Column<DateOnly>(type: "date", nullable: false),
                    OkumaXp = table.Column<int>(type: "integer", nullable: false),
                    KelimeXp = table.Column<int>(type: "integer", nullable: false),
                    CalismaXp = table.Column<int>(type: "integer", nullable: false),
                    QuizXp = table.Column<int>(type: "integer", nullable: false),
                    CumleXp = table.Column<int>(type: "integer", nullable: false),
                    HedefXp = table.Column<int>(type: "integer", nullable: false),
                    GuncellemeAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GunlukEtkinlikler", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GunlukEtkinlikler_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OgrenmeAyarlari",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    GunlukHedefXp = table.Column<int>(type: "integer", nullable: false),
                    SaatDilimi = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    GuncellemeAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OgrenmeAyarlari", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OgrenmeAyarlari_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GunlukEtkinlikler_UserId_Gun",
                table: "GunlukEtkinlikler",
                columns: new[] { "UserId", "Gun" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OgrenmeAyarlari_UserId",
                table: "OgrenmeAyarlari",
                column: "UserId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GunlukEtkinlikler");

            migrationBuilder.DropTable(
                name: "OgrenmeAyarlari");
        }
    }
}
