using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace EnglishReadingPlatform.Migrations
{
    /// <inheritdoc />
    public partial class AddCumleKayitlari : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CumleKayitlari",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    Cumle = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    CumleAnahtari = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Ceviri = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Baglam = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    AddedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DogruSayisi = table.Column<int>(type: "integer", nullable: false),
                    YanlisSayisi = table.Column<int>(type: "integer", nullable: false),
                    DogruSeri = table.Column<int>(type: "integer", nullable: false),
                    SonCalismaAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CumleKayitlari", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CumleKayitlari_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CumleKayitlari_UserId_CumleAnahtari",
                table: "CumleKayitlari",
                columns: new[] { "UserId", "CumleAnahtari" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CumleKayitlari");
        }
    }
}
